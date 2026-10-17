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
