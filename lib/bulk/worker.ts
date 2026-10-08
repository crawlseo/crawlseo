import { db } from "@/lib/db";
import { ReauthRequiredError } from "@/lib/google";
import { runGSCSync } from "@/lib/workers/gsc-sync";
import { syncBingDataForSite } from "@/lib/workers/bing-sync";
import { syncVitalsForSite } from "@/lib/workers/vitals-sync";
import { startSiteCrawl, recoverStaleCrawls } from "@/lib/crawler/lifecycle";
import type { BulkAction, BulkOptions, BulkTask } from "./types";
import { tasksJson } from "./store";

type Result = Pick<BulkTask, "status" | "message" | "values" | "crawlId"> & {
  blockAction?: string;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeBulkTask(
  userId: string,
  task: BulkTask,
  options: BulkOptions,
): Promise<Result> {
  const site = await db.site.findFirst({
    where: { id: task.siteId, userId },
    select: { id: true, domain: true, gscProperty: true, bingSite: true },
  });
  if (!site)
    return { status: "skipped", message: "Website no longer available" };
  if (task.action === "gsc") {
    if (!site.gscProperty)
      return { status: "skipped", message: "No GSC property connected" };
    try {
      const result = await runGSCSync(userId, site.id, site.gscProperty);
      return {
        status: "completed",
        message: "{keywords} keyword records and {pages} page records synced",
        values: {
          keywords: result.keywordsInserted,
          pages: result.pagesInserted,
        },
      };
    } catch (error) {
      if (error instanceof ReauthRequiredError)
        return {
          status: "failed",
          message: "Reconnect your Google account before syncing GSC.",
          blockAction: "Reconnect your Google account before syncing GSC.",
        };
      throw error;
    }
  }
  if (task.action === "bing") {
    if (!site.bingSite)
      return { status: "skipped", message: "No Bing property connected" };
    const key = await db.apiKey.findUnique({
      where: { userId_provider: { userId, provider: "bing" } },
      select: { id: true },
    });
    if (!key)
      return {
        status: "skipped",
        message: "Add a Bing API key in global settings.",
        blockAction: "Add a Bing API key in global settings.",
      };
    const result = await syncBingDataForSite(userId, site.id);
    if (!result.success)
      return {
        status: "failed",
        message: "Bing sync failed. Check the connection and try again.",
      };
    return {
      status: result.partial?.length ? "partial" : "completed",
      message: result.partial?.length
        ? "Bing synced with {count} unavailable endpoints"
        : "{queries} Bing queries and {pages} pages synced",
      values: {
        count: result.partial?.length ?? 0,
        queries: result.queriesUpserted,
        pages: result.pagesUpserted,
      },
    };
  }
  if (task.action === "vitals") {
    const result = await syncVitalsForSite(
      userId,
      site.id,
      options.vitalsLimit,
    );
    const quota = result.errorCode === "QUOTA_EXCEEDED";
    return {
      status:
        result.inserted === 0
          ? "failed"
          : result.results.some((row) => "error" in row)
            ? "partial"
            : "completed",
      message: quota
        ? "PageSpeed quota exhausted; {count} reports saved"
        : result.inserted === 0
          ? "PageSpeed check failed. Try again later."
          : "{count} PageSpeed reports saved",
      values: { count: result.inserted },
      ...(quota && {
        blockAction: "Skipped because the PageSpeed quota is exhausted",
      }),
    };
  }
  const started = await startSiteCrawl(db, site, options.maxPages);
  if (!started.started)
    return {
      status: "skipped",
      message: "A crawl is already running",
      crawlId: started.runningCrawlId,
    };
  // Wait for completion before starting another site's crawl. Merely awaiting
  // startSiteCrawl would launch the entire portfolio at once.
  for (;;) {
    await sleep(2_000);
    await recoverStaleCrawls(db, { siteId: site.id, crawlId: started.crawlId });
    const crawl = await db.crawl.findUnique({
      where: { id: started.crawlId },
      select: { status: true, pagesFound: true, issuesFound: true },
    });
    if (!crawl)
      return { status: "failed", message: "Crawl no longer available" };
    if (crawl.status === "COMPLETED")
      return {
        status: "completed",
        message: "{pages} pages crawled; {issues} issues found",
        values: { pages: crawl.pagesFound, issues: crawl.issuesFound },
        crawlId: started.crawlId,
      };
    if (crawl.status === "FAILED")
      return {
        status: "failed",
        message: "Crawl failed. Open the site's crawl report for details.",
        crawlId: started.crawlId,
      };
  }
}

export async function runBulkJob(id: string) {
  const claimed = await db.bulkJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "RUNNING", heartbeatAt: new Date() },
  });
  if (!claimed.count) return;
  const job = await db.bulkJob.findUniqueOrThrow({ where: { id } });
  const tasks = job.tasks as unknown as BulkTask[];
  const options = job.options as unknown as BulkOptions;
  const blocked = new Map<BulkAction, string>();
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
      const current = await db.bulkJob.findUnique({
        where: { id },
        select: { status: true, cancelRequested: true },
      });
      if (!current || current.status !== "RUNNING") return;
      if (current.cancelRequested) {
        for (const task of tasks)
          if (task.status === "pending") task.status = "cancelled";
        await db.bulkJob.updateMany({
          where: { id, status: "RUNNING" },
          data: {
            tasks: tasksJson(tasks),
            status: "CANCELLED",
            finishedAt: new Date(),
          },
        });
        return;
      }
      const task = tasks[index];
      const reason = blocked.get(task.action);
      if (reason) {
        tasks[index] = { ...task, status: "skipped", message: reason };
      } else {
        tasks[index] = { ...task, status: "running" };
        const saved = await db.bulkJob.updateMany({
          where: { id, status: "RUNNING" },
          data: { tasks: tasksJson(tasks), heartbeatAt: new Date() },
        });
        if (!saved.count) return;
        try {
          const { blockAction, ...result } = await executeBulkTask(
            job.userId,
            task,
            options,
          );
          if (blockAction) blocked.set(task.action, blockAction);
          tasks[index] = { ...task, ...result };
        } catch (error) {
          console.error(
            `Bulk action ${task.action} failed for site ${task.siteId}:`,
            error,
          );
          tasks[index] = {
            ...task,
            status: "failed",
            message: "This step failed. Other websites will continue.",
          };
        }
      }
      await db.bulkJob.updateMany({
        where: { id, status: "RUNNING" },
        data: { tasks: tasksJson(tasks), heartbeatAt: new Date() },
      });
    }
    await db.bulkJob.updateMany({
      where: { id, status: "RUNNING" },
      data: {
        status: "COMPLETED",
        tasks: tasksJson(tasks),
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`Bulk job ${id} interrupted:`, error);
    const remaining = tasks.map((task) =>
      task.status === "pending" || task.status === "running"
        ? {
            ...task,
            status: "failed" as const,
            message: "Batch interrupted. Start a new batch to retry.",
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
