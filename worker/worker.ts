import { utimes, writeFile } from "fs/promises";
import type { PrismaClient } from "@prisma/client";
import { recoverCrawlsOnStartup } from "@/lib/crawler/lifecycle";
import { queueConfig, workerMode } from "@/lib/jobs/config";
import { JobLoop } from "@/lib/jobs/loop";
import { JobRunner } from "@/lib/jobs/runner";
import { scheduleOnMaintenance } from "@/lib/jobs/scheduler";
import { APP_VERSION } from "@/lib/version";

/*
 * The worker process (`node worker.cjs`, the "worker" service in
 * docker-compose.yml): runs queued jobs, the scheduler and recovery, and
 * nothing else. It serves no HTTP; the compose healthcheck reads the mtime of
 * HEALTH_FILE, which it touches while the database answers.
 */

export const HEALTH_FILE = "/tmp/worker-alive";
const HEALTH_EVERY_MS = 15_000;

export type Worker = { loop: JobLoop; shutdown: (signal?: string) => Promise<void> };

export async function startWorker(
  db: PrismaClient,
  opts: { healthFile?: string; log?: (msg: string) => void } = {}
): Promise<Worker> {
  const log = opts.log ?? console.log;
  const mode = workerMode();
  if (mode === "off") {
    throw new Error("WORKER_MODE=off: this process must not run jobs. Set WORKER_MODE=worker for the worker service.");
  }
  if (mode === "inline") log("[worker] WORKER_MODE is not set to worker; running jobs anyway, as the worker");

  const config = queueConfig();
  const loop = new JobLoop(db, new JobRunner(db), {
    mode: "worker",
    ...config,
    onMaintenance: scheduleOnMaintenance(db, log),
    log,
  });
  log(`[worker] crawlseo ${APP_VERSION}`);
  await recoverCrawlsOnStartup(db, log);
  loop.start();

  const healthFile = opts.healthFile ?? HEALTH_FILE;
  const touch = async () => {
    try {
      await db.$queryRaw`SELECT 1`;
      const now = new Date();
      await utimes(healthFile, now, now).catch(() => writeFile(healthFile, ""));
    } catch (err) {
      log(`[worker] health check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  await touch();
  // Not unref'd: the loop's timers are, and this process has no server, so
  // this timer is what keeps it running until shutdown clears it.
  const health = setInterval(() => void touch(), HEALTH_EVERY_MS);

  let stopping: Promise<void> | null = null;
  const shutdown = (signal = "shutdown") =>
    (stopping ??= (async () => {
      log(`[worker] ${signal}: stopping, up to ${config.shutdownGraceMs / 1000} s for running jobs`);
      clearInterval(health);
      await loop.stop(config.shutdownGraceMs);
    })());

  return { loop, shutdown };
}

/** How long an uncaught exception may spend putting held jobs back before the process exits. */
const CRASH_RELEASE_MS = 5_000;

/**
 * Process-level error handlers. An unhandled rejection is logged and the
 * worker keeps going. An uncaught exception leaves the process in an unknown
 * state: the jobs it holds go back to the queue at once (instead of waiting
 * JOB_STALE_SECONDS for recovery), then it exits non-zero so the container
 * restarts it.
 */
export function crashHandlers(
  current: () => Worker | undefined,
  opts: { log?: (msg: string) => void; exit: (code: number) => void }
) {
  const log = opts.log ?? console.error;
  const describe = (e: unknown) => (e instanceof Error ? (e.stack ?? e.message) : String(e));
  let crashing = false;
  return {
    unhandledRejection(reason: unknown) {
      log(`[worker] unhandled rejection: ${describe(reason)}`);
    },
    async uncaughtException(err: unknown) {
      log(`[worker] uncaught exception: ${describe(err)}`);
      if (crashing) return;
      crashing = true;
      try {
        const worker = current();
        if (worker) {
          const released = await Promise.race([
            worker.loop.runner.forceReleaseAll(),
            new Promise<number>((resolve) => setTimeout(() => resolve(-1), CRASH_RELEASE_MS)),
          ]);
          log(released < 0 ? "[worker] could not put jobs back in time" : `[worker] put ${released} job(s) back in the queue`);
        }
      } catch (releaseErr) {
        log(`[worker] putting jobs back failed: ${describe(releaseErr)}`);
      } finally {
        opts.exit(1);
      }
    },
  };
}

