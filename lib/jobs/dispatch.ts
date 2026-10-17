import { after } from "next/server";
import type { Job, PrismaClient } from "@prisma/client";
import { isServerless, SERVERLESS_JOB_BUDGET_MS, workerMode } from "./config";
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

/** Margin kept before the deadline when deciding to start a follow-up job. */
const FOLLOW_UP_MARGIN_MS = 60_000;

/**
 * Claims and runs one job in this process, then the follow-ups it queued
 * while time is left. Does nothing if the job is no longer QUEUED or not due.
 */
export async function runJobNow(
  db: PrismaClient,
  jobId: string,
  opts: { deadline: number }
): Promise<void> {
  const runner = new JobRunner(db);
  const pending = [jobId];
  try {
    while (pending.length > 0) {
      const id = pending.shift()!;
      if (id !== jobId && Date.now() > opts.deadline - FOLLOW_UP_MARGIN_MS) break;
      const job = await claimJobById(db, { workerId: runner.workerId, jobId: id });
      if (!job) continue;
      const { followUps } = await runner.execute(job, { deadline: opts.deadline });
      pending.push(...followUps.map((f) => f.id));
    }
  } catch (err) {
    console.error(`[jobs] running job ${jobId} failed:`, err);
  }
}
