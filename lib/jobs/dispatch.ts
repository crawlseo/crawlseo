import { after } from "next/server";
import type { Job, PrismaClient } from "@prisma/client";
import { isServerless, SERVERLESS_JOB_BUDGET_MS, workerMode } from "./config";
import { getJobHandler } from "./handlers";
import { inlineJobLoop } from "./inline";
import { claimJobById } from "./queue";
import { JobRunner } from "./runner";

/*
 * What a request does after it queued a job (or found one already queued):
 * - inline on a long-running server: wake the loop so it claims now;
 * - inline on a serverless host: run the job after the response, within the
 *   route's maxDuration, because no process polls the queue there;
 * - off: nothing, the worker claims it.
 */
export function dispatchJob(db: PrismaClient, job: Pick<Job, "id" | "status">): void {
  if (job.status !== "QUEUED" || workerMode() !== "inline") return;
  if (isServerless()) {
    const deadline = Date.now() + SERVERLESS_JOB_BUDGET_MS;
    after(() => runJobNow(db, job.id, { deadline }));
    return;
  }
  inlineJobLoop()?.wake();
}

/** Margin kept before the deadline when deciding to start another attempt or a follow-up job. */
const START_MARGIN_MS = 60_000;

/**
 * Waits between attempts of a SHORT job retried inside one serverless
 * request: no process would run the retry later, so it runs here while the
 * request has time. Much shorter than the queue's backoff.
 */
export const IN_REQUEST_RETRY_DELAYS_MS = [2_000, 10_000, 30_000];

type Sleep = (ms: number) => Promise<void>;
const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claims and runs one job in this process, then the follow-ups it queued,
 * while time is left. A SHORT job whose attempt failed with an error a retry
 * can fix is tried again here (IN_REQUEST_RETRY_DELAYS_MS) while the budget
 * allows; otherwise it stays queued for its next attempt. Does nothing if the
 * job is no longer QUEUED or not due.
 */
export async function runJobNow(
  db: PrismaClient,
  jobId: string,
  opts: { deadline: number; sleep?: Sleep }
): Promise<void> {
  const wait = opts.sleep ?? sleep;
  const runner = new JobRunner(db);
  const pending = [jobId];
  try {
    while (pending.length > 0) {
      const id = pending.shift()!;
      if (id !== jobId && Date.now() > opts.deadline - START_MARGIN_MS) break;
      let job = await claimJobById(db, { workerId: runner.workerId, jobId: id });
      for (let retry = 0; job; retry++) {
        const { outcome, followUps } = await runner.execute(job, { deadline: opts.deadline });
        pending.push(...followUps.map((f) => f.id));
        if (outcome !== "retry" || getJobHandler(job.type)?.class !== "SHORT") break;
        const delay = IN_REQUEST_RETRY_DELAYS_MS[retry];
        if (delay === undefined || Date.now() + delay > opts.deadline - START_MARGIN_MS) break;
        await wait(delay);
        // Due now instead of after the queue's backoff, then claimed again.
        await db.job.updateMany({ where: { id, status: "QUEUED" }, data: { runAt: new Date() } });
        job = await claimJobById(db, { workerId: runner.workerId, jobId: id });
      }
    }
  } catch (err) {
    console.error(`[jobs] running job ${jobId} failed:`, err);
  }
}
