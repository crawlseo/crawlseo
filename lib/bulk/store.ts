import type { BulkJob, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { BulkJobView, BulkTask } from "./types";

export const ACTIVE_JOB_STATUSES = ["QUEUED", "RUNNING"];
export const STALE_JOB_MS = 3 * 60_000;
export const tasksJson = (tasks: BulkTask[]) =>
  tasks as unknown as Prisma.InputJsonValue;

export function jobView(job: BulkJob): BulkJobView {
  return {
    id: job.id,
    status: job.status,
    tasks: job.tasks as unknown as BulkTask[],
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

// A stopped server cannot finish an in-process job. Keep its results and mark
// unfinished steps explicitly, rather than silently restarting external work.
export async function recoverBulkJobs(userId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_JOB_MS);
  const stale = await db.bulkJob.findMany({
    where: {
      userId,
      status: { in: ACTIVE_JOB_STATUSES },
      heartbeatAt: { lt: cutoff },
    },
  });
  for (const job of stale) {
    const tasks = (job.tasks as unknown as BulkTask[]).map((task) =>
      task.status === "pending" || task.status === "running"
        ? {
            ...task,
            status: "failed" as const,
            message:
              "Interrupted by a server restart. Start a new batch to retry.",
          }
        : task,
    );
    await db.bulkJob.updateMany({
      where: {
        id: job.id,
        status: { in: ACTIVE_JOB_STATUSES },
        heartbeatAt: { lt: cutoff },
      },
      data: { status: "FAILED", tasks: tasksJson(tasks), finishedAt: now },
    });
  }
}
