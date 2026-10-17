import { randomBytes } from "crypto";
import { hostname } from "os";
import type { Job, Prisma, PrismaClient } from "@prisma/client";
import { isServerless } from "./config";
import { getJobHandler } from "./handlers";
import {
  enqueueJob,
  heartbeatJobs,
  markFailed,
  markRetry,
  markSucceeded,
  releaseJob,
} from "./queue";
import { JobError, JobLostError, JobReleasedError, type JobHandler } from "./types";

/*
 * Runs claimed jobs in this process: calls the handler, sends heartbeats while
 * it runs, and records the outcome. Used by the job loop (inline mode and the
 * worker) and by a serverless request that runs one job after its response.
 */

export type JobOutcome = "succeeded" | "retry" | "failed" | "released" | "lost";

export type JobRun = { outcome: JobOutcome; followUps: Job[] };

type Running = {
  job: Job;
  handler: JobHandler | undefined;
  controller: AbortController;
  state: "running" | "releasing" | "lost";
};

export const HEARTBEAT_EVERY_MS = 15_000;

export function newWorkerId(): string {
  return `${hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class JobRunner {
  readonly workerId: string;
  private readonly running = new Map<string, Running>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: PrismaClient,
    private readonly opts: { workerId?: string; heartbeatMs?: number; log?: (msg: string) => void } = {}
  ) {
    this.workerId = opts.workerId ?? newWorkerId();
  }

  /** Jobs running now, per class. */
  count(cls?: JobHandler["class"]): number {
    let n = 0;
    for (const r of this.running.values()) if (!cls || r.handler?.class === cls) n++;
    return n;
  }

  private log(msg: string) {
    (this.opts.log ?? console.log)(`[jobs] ${msg}`);
  }

  async execute(job: Job, opts: { deadline?: number } = {}): Promise<JobRun> {
    const handler = getJobHandler(job.type);
    const entry: Running = { job, handler, controller: new AbortController(), state: "running" };
    this.running.set(job.id, entry);
    this.startHeartbeat();
    try {
      if (!handler) {
        const ok = await markFailed(this.db, job, this.workerId, {
          message: `Unknown job type: ${job.type}`,
          code: "UNKNOWN_TYPE",
        });
        return { outcome: ok ? "failed" : "lost", followUps: [] };
      }

      let result: Prisma.InputJsonValue | undefined;
      try {
        result = await handler.run({
          db: this.db,
          job,
          workerId: this.workerId,
          signal: entry.controller.signal,
          deadline: opts.deadline,
        });
      } catch (err) {
        return { outcome: await this.settleError(entry, handler, err), followUps: [] };
      }

      if (!(await markSucceeded(this.db, job, this.workerId, result))) {
        this.log(`${job.type} ${job.id} finished after another process took it over; result discarded`);
        return { outcome: "lost", followUps: [] };
      }
      this.log(`${job.type} ${job.id} succeeded`);
      return { outcome: "succeeded", followUps: await this.queueFollowUps(job, handler) };
    } finally {
      this.running.delete(job.id);
      if (this.running.size === 0) this.stopHeartbeat();
    }
  }

  private async settleError(entry: Running, handler: JobHandler, err: unknown): Promise<JobOutcome> {
    const { job } = entry;
    if (entry.state === "releasing") {
      const ok = await releaseJob(this.db, job, this.workerId);
      if (ok) this.log(`${job.type} ${job.id} released for another run`);
      return ok ? "released" : "lost";
    }
    if (entry.state === "lost" || err instanceof JobLostError) {
      this.log(`${job.type} ${job.id} stopped: another process took it over`);
      return "lost";
    }

    const failure = { message: errorMessage(err), code: err instanceof JobError ? err.code : undefined };
    // On a serverless host nothing runs a LONG job later; a queued one would
    // only block the next request for it.
    const noLaterRun = handler.class === "LONG" && isServerless();
    if (handler.isPermanent(err) || job.attempts >= job.maxAttempts || noLaterRun) {
      const ok = await markFailed(this.db, job, this.workerId, failure);
      this.log(`${job.type} ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}): ${failure.message}`);
      return ok ? "failed" : "lost";
    }
    const ok = await markRetry(this.db, job, this.workerId, failure);
    this.log(`${job.type} ${job.id} will retry (attempt ${job.attempts}/${job.maxAttempts}): ${failure.message}`);
    return ok ? "retry" : "lost";
  }

  private async queueFollowUps(job: Job, handler: JobHandler): Promise<Job[]> {
    const queued: Job[] = [];
    for (const type of handler.followUps?.(job) ?? []) {
      try {
        const { job: next, created } = await enqueueJob(this.db, { type, siteId: job.siteId, source: "chain" });
        if (created) queued.push(next);
      } catch (err) {
        this.log(`could not queue ${type} after ${job.type} ${job.id}: ${errorMessage(err)}`);
      }
    }
    return queued;
  }

  /**
   * Stops jobs for shutdown: they go back to the queue once their handler
   * returns. `filter` picks which ones (e.g. those that stop at once).
   */
  release(filter: (handler: JobHandler | undefined) => boolean = () => true): void {
    for (const entry of this.running.values()) {
      if (entry.state !== "running" || !filter(entry.handler)) continue;
      entry.state = "releasing";
      entry.controller.abort(new JobReleasedError());
    }
  }

  /**
   * Shutdown deadline: puts every job still running back in the queue now,
   * without waiting for its handler. A handler that finishes later changes
   * nothing (its writes are fenced).
   */
  async forceReleaseAll(): Promise<number> {
    let n = 0;
    for (const entry of [...this.running.values()]) {
      entry.state = "releasing";
      entry.controller.abort(new JobReleasedError());
      if (await releaseJob(this.db, entry.job, this.workerId)) n++;
    }
    return n;
  }

  /** Sends one heartbeat; jobs this process no longer holds are stopped. */
  async heartbeat(now: Date = new Date()): Promise<void> {
    const ids = [...this.running.keys()];
    if (ids.length === 0) return;
    const held = await heartbeatJobs(this.db, { workerId: this.workerId, jobIds: ids, now });
    for (const id of ids) {
      const entry = this.running.get(id);
      if (!entry || held.has(id) || entry.state !== "running") continue;
      entry.state = "lost";
      entry.controller.abort(new JobLostError());
    }
  }

  private startHeartbeat() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.heartbeat().catch((err) => this.log(`heartbeat failed: ${errorMessage(err)}`));
    }, this.opts.heartbeatMs ?? HEARTBEAT_EVERY_MS);
    this.timer.unref?.();
  }

  private stopHeartbeat() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
