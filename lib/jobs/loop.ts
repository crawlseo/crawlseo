import { hostname } from "os";
import type { PrismaClient } from "@prisma/client";
import { recoverStaleCrawls } from "@/lib/crawler/lifecycle";
import { APP_VERSION } from "@/lib/version";
import { jobTypes } from "./handlers";
import { claimJobs, recoverStaleJobs } from "./queue";
import { HEARTBEAT_EVERY_MS, type JobRunner } from "./runner";
import type { JobClass } from "./types";

/*
 * The polling loop of a process that runs jobs (inline mode in the app, or
 * the worker): claims due jobs up to the concurrency limit of each class,
 * recovers jobs of dead processes, and keeps a WorkerHeartbeat row so the app
 * can tell that something picks up queued jobs.
 */

export type JobLoopOptions = {
  mode: "inline" | "worker";
  longConcurrency: number;
  shortConcurrency: number;
  pollMs: number;
  staleMs: number;
  /** Runs on every recovery pass (the scheduler hooks in here). */
  onMaintenance?: () => Promise<void>;
  maintenanceEveryMs?: number;
  log?: (msg: string) => void;
};

const CLASSES: JobClass[] = ["LONG", "SHORT"];

/** Heartbeat rows of processes gone for this long are deleted. */
const HEARTBEAT_ROW_TTL_MS = 24 * 60 * 60_000;

export class JobLoop {
  private readonly startedAt = new Date();
  private readonly inflight = new Set<Promise<void>>();
  private readonly active: Record<JobClass, number> = { LONG: 0, SHORT: 0 };
  private timers: NodeJS.Timeout[] = [];
  private ticking: Promise<number> | null = null;
  private again = false;
  private stopping = false;

  constructor(
    private readonly db: PrismaClient,
    readonly runner: JobRunner,
    private readonly opts: JobLoopOptions
  ) {}

  private log(msg: string) {
    (this.opts.log ?? console.log)(`[jobs] ${msg}`);
  }

  private limit(cls: JobClass): number {
    return cls === "LONG" ? this.opts.longConcurrency : this.opts.shortConcurrency;
  }

  /** Starts polling. Recovery and the heartbeat row run right away. */
  start(): void {
    this.log(
      `${this.opts.mode} job processing started (${this.runner.workerId}; ` +
        `long ${this.opts.longConcurrency}, short ${this.opts.shortConcurrency})`
    );
    const every = (ms: number, fn: () => Promise<unknown>) => {
      const run = () => void fn().catch((err) => this.log(`${err instanceof Error ? err.message : String(err)}`));
      run();
      const t = setInterval(run, ms);
      t.unref?.();
      this.timers.push(t);
    };
    every(HEARTBEAT_EVERY_MS, () => this.writeHeartbeatRow());
    every(this.opts.maintenanceEveryMs ?? 60_000, () => this.maintenance());
    every(this.opts.pollMs, () => this.tick());
  }

  /** Claims right away instead of at the next poll (a job was just queued). */
  wake(): void {
    if (this.stopping) return;
    void this.tick().catch((err) => this.log(`claim failed: ${err instanceof Error ? err.message : String(err)}`));
  }

  /**
   * Claims due jobs up to the free slots of each class and starts them.
   * Returns how many started. Calls made while one runs are folded into one
   * more pass.
   */
  tick(): Promise<number> {
    if (this.ticking) {
      this.again = true;
      return this.ticking;
    }
    this.ticking = (async () => {
      let started = 0;
      do {
        this.again = false;
        started += await this.claimOnce();
      } while (this.again && !this.stopping);
      return started;
    })().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private async claimOnce(): Promise<number> {
    let started = 0;
    for (const cls of CLASSES) {
      if (this.stopping) break;
      const free = this.limit(cls) - this.active[cls];
      if (free < 1) continue;
      const jobs = await claimJobs(this.db, {
        workerId: this.runner.workerId,
        types: jobTypes(cls),
        limit: free,
      });
      for (const job of jobs) {
        started++;
        this.active[cls]++;
        const run = this.runner
          .execute(job)
          .then(() => undefined)
          .catch((err) => this.log(`${job.type} ${job.id} crashed: ${err instanceof Error ? err.message : String(err)}`))
          .finally(() => {
            this.active[cls]--;
            this.inflight.delete(run);
            // A slot is free, and a follow-up may have been queued.
            this.wake();
          });
        this.inflight.add(run);
      }
    }
    return started;
  }

  /** Recovers jobs and crawls of dead processes, then runs the maintenance hook. */
  async maintenance(now: Date = new Date()): Promise<void> {
    const { requeued, failed } = await recoverStaleJobs(this.db, { now, staleMs: this.opts.staleMs });
    if (requeued || failed) this.log(`recovered interrupted jobs: ${requeued} queued again, ${failed} failed`);
    await recoverStaleCrawls(this.db, { now });
    await this.db.workerHeartbeat.deleteMany({
      where: { lastSeenAt: { lt: new Date(now.getTime() - HEARTBEAT_ROW_TTL_MS) } },
    });
    await this.opts.onMaintenance?.();
    if (requeued) this.wake();
  }

  private async writeHeartbeatRow(now: Date = new Date()) {
    const id = this.runner.workerId;
    await this.db.workerHeartbeat.upsert({
      where: { id },
      create: {
        id,
        mode: this.opts.mode,
        hostname: hostname(),
        version: APP_VERSION,
        startedAt: this.startedAt,
        lastSeenAt: now,
      },
      update: { lastSeenAt: now },
    });
  }

  /** Runs every due job, and the ones they queue, until none is left (tests and one-off runs). */
  async drain(): Promise<void> {
    for (;;) {
      const started = await this.tick();
      if (started === 0 && this.inflight.size === 0) return;
      if (this.inflight.size > 0) await Promise.race(this.inflight);
    }
  }

  /**
   * Graceful stop: claims nothing more, stops jobs that stop at once (crawls)
   * and puts them back in the queue, gives the others `graceMs` to finish,
   * then puts whatever still runs back in the queue.
   */
  async stop(graceMs: number): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.ticking?.catch(() => 0);

    this.runner.release((handler) => handler?.stopOnShutdown === true);
    const all = Promise.allSettled([...this.inflight]);
    const timedOut = await Promise.race([
      all.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), graceMs).unref?.()),
    ]);
    if (timedOut) {
      const n = await this.runner.forceReleaseAll();
      this.log(`shutdown grace over: ${n} job(s) put back in the queue`);
    }
    await this.db.workerHeartbeat.deleteMany({ where: { id: this.runner.workerId } }).catch(() => {});
    this.log("job processing stopped");
  }
}
