/*
 * Job queue settings from the environment. Every value has a default, so an
 * install that sets none of them keeps working: WORKER_MODE defaults to
 * "inline", which runs jobs in the app process as before.
 */

type Env = Record<string, string | undefined>;

/**
 * Who processes jobs.
 * - inline: the app process does (Docker single container, `npm start`). On a
 *   serverless host there is no long-running process, so a request that queues
 *   a job runs it after its response, and a cron request runs the rest.
 * - off: this process only queues jobs; a worker process runs them.
 * - worker: the worker process (`node worker.mjs`).
 */
export type WorkerMode = "inline" | "off" | "worker";

const MODES: WorkerMode[] = ["inline", "off", "worker"];

export function workerMode(env: Env = process.env): WorkerMode {
  const raw = env.WORKER_MODE?.trim().toLowerCase();
  if (!raw) return "inline";
  if ((MODES as string[]).includes(raw)) return raw as WorkerMode;
  console.warn(`WORKER_MODE=${env.WORKER_MODE} is not one of ${MODES.join(", ")}; using inline`);
  return "inline";
}

/** A serverless host: no process outlives a request, so nothing can poll the queue. */
export function isServerless(env: Env = process.env): boolean {
  return Boolean(env.VERCEL);
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export type QueueConfig = {
  longConcurrency: number;
  shortConcurrency: number;
  pollMs: number;
  shutdownGraceMs: number;
  staleMs: number;
};

export function queueConfig(env: Env = process.env): QueueConfig {
  return {
    longConcurrency: positiveInt(env.WORKER_LONG_CONCURRENCY, 1),
    shortConcurrency: positiveInt(env.WORKER_SHORT_CONCURRENCY, 2),
    pollMs: positiveInt(env.WORKER_POLL_SECONDS, 5) * 1000,
    shutdownGraceMs: positiveInt(env.WORKER_SHUTDOWN_GRACE_SECONDS, 25) * 1000,
    staleMs: positiveInt(env.JOB_STALE_SECONDS, 180) * 1000,
  };
}

/**
 * How long a request on a serverless host may spend on a job it runs after
 * its response. The routes that do this set maxDuration = 300, the most every
 * plan allows; 30 s are kept for writing the result.
 */
export const SERVERLESS_MAX_DURATION_S = 300;
export const SERVERLESS_JOB_BUDGET_MS = (SERVERLESS_MAX_DURATION_S - 30) * 1000;
