import type { Job } from "@prisma/client";
import { db } from "@/lib/db";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { requestCrawl, requestSiteJob } from "@/lib/jobs/site-jobs";
import { recoverStaleJobs } from "@/lib/jobs/queue";
import type { BulkAction, BulkOptions, BulkTask } from "./types";
import { tasksJson } from "./store";

type Result = Pick<
  BulkTask,
  "status" | "message" | "values" | "crawlId" | "jobId"
> & {
  blockAction?: string;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jobTypes: Record<BulkAction, string> = {
  gsc: "gsc-sync",
  bing: "bing-sync",
  crawl: "crawl",
  vitals: "vitals",
};
const detachedMessage =
  "Queue stopped. This action continues separately; open the site for its result.";

function outcome(task: BulkTask, job: Job): Result {
  const ids = { jobId: job.id, ...(job.crawlId && { crawlId: job.crawlId }) };
  if (job.status === "FAILED") {
    const blockAction =
      job.errorCode === "REAUTH_REQUIRED"
        ? "Reconnect your Google account before syncing GSC."
        : job.errorCode === "QUOTA_EXCEEDED"
          ? "Skipped because the PageSpeed quota is exhausted"
          : job.errorCode === "KEY_MISSING"
            ? "Add a Bing API key in Settings > Connections."
            : undefined;
    return {
      ...ids,
      status: "failed",
      message: blockAction ?? "This step failed. Open the site for details.",
      ...(blockAction && { blockAction }),
    };
  }
  const result = (job.result ?? {}) as {
    keywordsInserted?: number;
    pagesInserted?: number;
    queriesUpserted?: number;
    pagesUpserted?: number;
    partial?: string[];
    inserted?: number;
    results?: Array<{ error?: string }>;
    errorCode?: string;
    pagesFound?: number;
    issuesFound?: number;
  };
  if (task.action === "gsc")
    return {
      ...ids,
      status: "completed",
      message: `${result.keywordsInserted ?? 0} keyword records and ${result.pagesInserted ?? 0} page records synced`,
    };
  if (task.action === "bing")
    return {
      ...ids,
      status: result.partial?.length ? "partial" : "completed",
      message: result.partial?.length
        ? `Bing synced with ${result.partial.length} unavailable endpoints`
        : `${result.queriesUpserted ?? 0} Bing queries and ${result.pagesUpserted ?? 0} pages synced`,
    };
  if (task.action === "vitals") {
    const count = result.inserted ?? 0;
    const quota = result.errorCode === "QUOTA_EXCEEDED";
    return {
      ...ids,
      status:
        count === 0
          ? "failed"
          : result.results?.some((row) => row.error)
            ? "partial"
            : "completed",
      message: quota
        ? `PageSpeed quota exhausted; ${count} reports saved`
        : `${count} PageSpeed reports saved`,
      values: { count },
      ...(quota && {
        blockAction: "Skipped because the PageSpeed quota is exhausted",
      }),
    };
  }
  return {
    ...ids,
    status: "completed",
    message: `${result.pagesFound ?? 0} pages crawled; ${result.issuesFound ?? 0} issues found`,
    values: { pages: result.pagesFound ?? 0, issues: result.issuesFound ?? 0 },
  };
}

async function control(id: string) {
  return db.bulkJob.findUnique({
    where: { id },
    select: { status: true, cancelRequested: true },
  });
}

async function executeBulkTask(
  batchId: string,
  userId: string,
  task: BulkTask,
  options: BulkOptions,
  onQueued: (jobId: string) => Promise<void>,
): Promise<Result> {
  const site = await db.site.findFirst({
    where: { id: task.siteId, userId },
    select: { id: true, userId: true, gscProperty: true, bingSite: true },
  });
  if (!site)
    return { status: "skipped", message: "Website no longer available" };
  if (task.action === "gsc" && !site.gscProperty)
    return { status: "skipped", message: "No GSC property connected" };
  if (task.action === "bing") {
    if (!site.bingSite)
      return { status: "skipped", message: "No Bing property connected" };
    if (!(await db.apiKey.count({ where: { userId, provider: "bing" } })))
      return {
        status: "skipped",
        message: "Add a Bing API key in Settings > Connections.",
        blockAction: "Add a Bing API key in Settings > Connections.",
      };
  }
  const current = await control(batchId);
  if (!current || current.status !== "RUNNING" || current.cancelRequested)
    return { status: "cancelled" };

  let job: Job;
  if (task.action === "crawl") {
    const requested = await requestCrawl(db, site, {
      source: "manual",
      maxPages: options.maxPages,
    });
    if (requested.status === "refused")
      return { status: "skipped", message: requested.reason };
    job = requested.job;
  } else {
    ({ job } = await requestSiteJob(db, {
      type: jobTypes[task.action],
      siteId: site.id,
      source: "manual",
      ...(task.action === "vitals" && {
        payload: { limit: options.vitalsLimit },
      }),
    }));
  }
  // Do not duplicate work already running, including work started by a schedule.
  if (job.status === "RUNNING")
    return {
      status: "skipped",
      message: "This action is already running",
      jobId: job.id,
    };
  await onQueued(job.id);
  dispatchJob(db, job);

  // The normal inline loop or standalone worker owns the job and its retries.
  // Only this coordinator waits; stopping a batch never cancels a shared job.
  for (;;) {
    const current = await control(batchId);
    if (!current || current.status !== "RUNNING" || current.cancelRequested)
      return { status: "cancelled", message: detachedMessage, jobId: job.id };
    await recoverStaleJobs(db, { siteId: site.id });
    const latest = await db.job.findFirst({
      where: { id: job.id, site: { userId } },
    });
    if (!latest)
      return {
        status: "failed",
        message: "Action no longer available",
        jobId: job.id,
      };
    if (latest.status === "SUCCEEDED" || latest.status === "FAILED")
      return outcome(task, latest);
    await sleep(2_000);
  }
}

export async function runBulkJob(id: string) {
  const claimed = await db.bulkJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "RUNNING", heartbeatAt: new Date() },
  });
  if (!claimed.count) return;
  const job = await db.bulkJob.findUnique({ where: { id } });
  if (!job) return;
  const tasks = job.tasks as unknown as BulkTask[];
  const options = job.options as unknown as BulkOptions;
  const blocked = new Map<BulkAction, string>();
  const save = () =>
    db.bulkJob.updateMany({
      where: { id, status: "RUNNING" },
      data: { tasks: tasksJson(tasks), heartbeatAt: new Date() },
    });
  const cancel = async () => {
    for (const task of tasks)
      if (task.status === "pending" || task.status === "running") {
        task.status = "cancelled";
        if (task.jobId) task.message = detachedMessage;
      }
    await db.bulkJob.updateMany({
      where: { id, status: "RUNNING" },
      data: {
        tasks: tasksJson(tasks),
        status: "CANCELLED",
        finishedAt: new Date(),
      },
    });
  };
  const heartbeat = setInterval(() => {
    void db.bulkJob
      .updateMany({
        where: { id, status: "RUNNING" },
        data: { heartbeatAt: new Date() },
      })
      .catch(() => {});
  }, 15_000);
  heartbeat.unref?.();
  try {
    for (let index = 0; index < tasks.length; index++) {
      if (tasks[index].status !== "pending") continue;
      const current = await control(id);
      if (!current || current.status !== "RUNNING") return;
      if (current.cancelRequested) {
        await cancel();
        return;
      }
      const task = tasks[index];
      const reason = blocked.get(task.action);
      if (reason)
        tasks[index] = { ...task, status: "skipped", message: reason };
      else {
        tasks[index] = { ...task, status: "running" };
        if (!(await save()).count) return;
        try {
          const { blockAction, ...result } = await executeBulkTask(
            id,
            job.userId,
            task,
            options,
            async (jobId) => {
              tasks[index].jobId = jobId;
              await save();
            },
          );
          if (blockAction) blocked.set(task.action, blockAction);
          tasks[index] = { ...tasks[index], ...result };
          if (result.status === "cancelled") {
            await cancel();
            return;
          }
        } catch (error) {
          console.error(
            `Bulk action ${task.action} failed for site ${task.siteId}:`,
            error,
          );
          tasks[index] = {
            ...tasks[index],
            status: "failed",
            message: "This step failed. Other websites will continue.",
          };
        }
      }
      if (!(await save()).count) return;
    }
    // A stop during the final step must not be overwritten with COMPLETED.
    const finished = await db.bulkJob.updateMany({
      where: { id, status: "RUNNING", cancelRequested: false },
      data: {
        status: "COMPLETED",
        tasks: tasksJson(tasks),
        finishedAt: new Date(),
      },
    });
    if (!finished.count) await cancel();
  } catch (error) {
    console.error(`Bulk job ${id} interrupted:`, error);
    const remaining = tasks.map((task) =>
      task.status === "pending" || task.status === "running"
        ? {
            ...task,
            status: "failed" as const,
            message:
              "Batch interrupted. Check the site's jobs before retrying.",
          }
        : task,
    );
    await db.bulkJob
      .updateMany({
        where: { id, status: "RUNNING" },
        data: {
          status: "FAILED",
          tasks: tasksJson(remaining),
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
  } finally {
    clearInterval(heartbeat);
  }
}
