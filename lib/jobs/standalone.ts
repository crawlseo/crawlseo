import type { Job, PrismaClient } from "@prisma/client";
import { claimJobById } from "./queue";
import { JobRunner } from "./runner";
import { workerSeen } from "./site-jobs";

/*
 * For a process that queues jobs but runs no job loop (the MCP server): when
 * no process that runs jobs is seen (no worker, no app in inline mode), it
 * runs the job it queued itself, in the background, so the job does not wait
 * for a worker that is not there. When one is seen, it only queues.
 */

const holder = globalThis as unknown as { crawlseoStandaloneRunner?: JobRunner };

export async function runHereIfNoWorker(
  db: PrismaClient,
  job: Pick<Job, "id" | "status">,
  opts: { log?: (msg: string) => void } = {}
): Promise<boolean> {
  if (job.status !== "QUEUED" || (await workerSeen(db))) return false;
  const runner = (holder.crawlseoStandaloneRunner ??= new JobRunner(db, { log: opts.log }));
  const claimed = await claimJobById(db, { workerId: runner.workerId, jobId: job.id });
  if (!claimed) return false;
  void runner
    .execute(claimed)
    .catch((err) => (opts.log ?? console.error)(`[jobs] ${claimed.type} ${claimed.id} crashed: ${String(err)}`));
  return true;
}
