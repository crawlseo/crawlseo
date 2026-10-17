import type { Job, Prisma, PrismaClient } from "@prisma/client";

/** LONG jobs (crawls, vitals) and SHORT jobs (syncs) have separate concurrency limits. */
export type JobClass = "LONG" | "SHORT";

export type JobSource = "manual" | "mcp" | "schedule" | "chain" | "site-added";

export type JobContext = {
  db: PrismaClient;
  /** The claimed row; `attempts` already counts this attempt. */
  job: Job;
  /** Id of this process, as in Job.lockedBy. */
  workerId: string;
  /**
   * Aborts when the job must stop: the process shuts down, or another process
   * took the job over after this one stopped sending heartbeats.
   */
  signal: AbortSignal;
  /** Epoch ms by which the job should be done (serverless requests only). */
  deadline?: number;
};

export type JobHandler = {
  /** The Job.type it runs. Any string; registering a new one needs no schema change. */
  type: string;
  class: JobClass;
  /** Attempts before the job counts as failed, this one included. At least 1. */
  maxAttempts: number;
  /** Errors that no retry can fix (missing connection, expired token): the job fails at once. */
  isPermanent: (error: unknown) => boolean;
  /** Stop at once on shutdown and run again later, instead of finishing within the grace period. */
  stopOnShutdown?: boolean;
  /** What the job did, stored in Job.result. */
  run: (ctx: JobContext) => Promise<Prisma.InputJsonValue | undefined>;
  /** Clean up after a process that ran this job died (recovery). */
  onInterrupted?: (db: PrismaClient, job: Job) => Promise<void>;
  /** Jobs to queue for the same site once this one succeeded. */
  followUps?: (job: Job) => string[];
};

/** An error a handler throws on purpose, with a code the UI can map and whether a retry can help. */
export class JobError extends Error {
  readonly code?: string;
  readonly permanent: boolean;

  constructor(message: string, opts: { code?: string; permanent?: boolean } = {}) {
    super(message);
    this.name = "JobError";
    this.code = opts.code;
    this.permanent = opts.permanent ?? false;
  }
}

/** The default `isPermanent`: only a JobError marked permanent. */
export function isPermanentJobError(error: unknown): boolean {
  return error instanceof JobError && error.permanent;
}

/** This process no longer holds the job: another one took it over, or its row is gone. */
export class JobLostError extends Error {
  constructor(message = "Stopped: another process took this job over") {
    super(message);
    this.name = "JobLostError";
  }
}

/** The process is shutting down; the job goes back to the queue. */
export class JobReleasedError extends Error {
  constructor(message = RELEASED_MESSAGE) {
    super(message);
    this.name = "JobReleasedError";
  }
}

export const RELEASED_MESSAGE =
  "Stopped because the process running it shut down. It is queued to run again.";

export const INTERRUPTED_JOB_MESSAGE =
  "Interrupted: the process running this job stopped responding";

/** A LONG job interrupted on a serverless host, where nothing runs it again by itself. */
export const INTERRUPTED_RUN_AGAIN_MESSAGE = "Interrupted. Run it again.";
