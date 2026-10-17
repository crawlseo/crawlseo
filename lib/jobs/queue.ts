import { Prisma, type Job, type PrismaClient } from "@prisma/client";
import { queueConfig } from "./config";
import { getJobHandler } from "./handlers";
import { INTERRUPTED_JOB_MESSAGE, type JobSource } from "./types";

/*
 * The Postgres job queue. Every state change that a process makes to a job it
 * runs is fenced on (id, lockedBy, status RUNNING): once recovery gave the job
 * to someone else, the old process's writes change nothing.
 *
 *   QUEUED -> RUNNING -> SUCCEEDED
 *                    \-> QUEUED (retry with backoff, or released on shutdown)
 *                    \-> FAILED (permanent error, or out of attempts)
 */

type Db = PrismaClient;

/** Priority of jobs a person asked for: they run before scheduled ones. */
export const MANUAL_PRIORITY = 10;

/** One active (QUEUED or RUNNING) job per type and site. */
export function activeKeyFor(type: string, siteId: string): string {
  return `${type}:${siteId}`;
}

/**
 * A timestamp parameter for raw SQL. Prisma stores DateTime in `timestamp(3)`
 * columns as UTC; converting explicitly keeps comparisons right whatever the
 * database session's time zone is.
 */
function sqlTime(d: Date): Prisma.Sql {
  return Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

export type EnqueueInput = {
  type: string;
  /** Every job belongs to a site, so deleting the site (or its owner) deletes its jobs. */
  siteId: string;
  source: JobSource;
  payload?: Prisma.InputJsonValue;
  priority?: number;
  runAt?: Date;
};

/**
 * Queues a job, unless one of the same type for the same site is still QUEUED
 * or RUNNING: then that one is returned with `created: false`.
 */
export async function enqueueJob(
  db: Db,
  input: EnqueueInput
): Promise<{ job: Job; created: boolean }> {
  const handler = getJobHandler(input.type);
  if (!handler) throw new Error(`Unknown job type: ${input.type}`);
  const activeKey = activeKeyFor(input.type, input.siteId);

  // INSERT ... ON CONFLICT DO NOTHING: the unique activeKey makes a second
  // active job of the same type for the site a no-op instead of an error. The
  // active job can finish between the insert and the lookup; then the next
  // insert goes through.
  for (let i = 0; i < 3; i++) {
    const [job] = await db.job.createManyAndReturn({
      data: [
        {
          type: input.type,
          siteId: input.siteId,
          source: input.source,
          payload: input.payload,
          priority: input.priority ?? 0,
          runAt: input.runAt ?? new Date(),
          maxAttempts: handler.maxAttempts,
          activeKey,
        },
      ],
      skipDuplicates: true,
    });
    if (job) return { job, created: true };
    const existing = await db.job.findUnique({ where: { activeKey } });
    if (existing) return { job: existing, created: false };
  }
  throw new Error(`Could not queue ${input.type}: the active job kept changing`);
}

const CLAIM_ORDER: Prisma.JobOrderByWithRelationInput[] = [
  { priority: "desc" },
  { runAt: "asc" },
  { createdAt: "asc" },
];

async function claim(
  db: Db,
  workerId: string,
  now: Date,
  pick: (tx: Prisma.TransactionClient) => Promise<{ id: string }[]>
): Promise<Job[]> {
  return db.$transaction(async (tx) => {
    // The rows stay locked until the transaction ends, and SKIP LOCKED makes
    // every other claimer pass over them: no job is claimed twice.
    const ids = (await pick(tx)).map((r) => r.id);
    if (ids.length === 0) return [];
    await tx.job.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "RUNNING",
        lockedBy: workerId,
        lockedAt: now,
        heartbeatAt: now,
        startedAt: now,
        attempts: { increment: 1 },
      },
    });
    return tx.job.findMany({ where: { id: { in: ids } }, orderBy: CLAIM_ORDER });
  });
}

/** Claims up to `limit` due jobs of these types, highest priority first. */
export async function claimJobs(
  db: Db,
  opts: { workerId: string; types: string[]; limit: number; now?: Date }
): Promise<Job[]> {
  const now = opts.now ?? new Date();
  if (opts.limit < 1 || opts.types.length === 0) return [];
  return claim(db, opts.workerId, now, (tx) => tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Job"
    WHERE "status" = 'QUEUED' AND "runAt" <= ${sqlTime(now)} AND "type" = ANY(${opts.types}::text[])
    ORDER BY "priority" DESC, "runAt" ASC, "createdAt" ASC
    LIMIT ${opts.limit}
    FOR UPDATE SKIP LOCKED`);
}

/** Claims one job by id if it is QUEUED and due. */
export async function claimJobById(
  db: Db,
  opts: { workerId: string; jobId: string; now?: Date }
): Promise<Job | null> {
  const now = opts.now ?? new Date();
  const [job] = await claim(db, opts.workerId, now, (tx) => tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Job"
    WHERE "id" = ${opts.jobId} AND "status" = 'QUEUED' AND "runAt" <= ${sqlTime(now)}
    FOR UPDATE SKIP LOCKED`);
  return job ?? null;
}

/** Records that this process still runs these jobs. Returns the ones it still holds. */
export async function heartbeatJobs(
  db: Db,
  opts: { workerId: string; jobIds: string[]; now?: Date }
): Promise<Set<string>> {
  if (opts.jobIds.length === 0) return new Set();
  const held = { id: { in: opts.jobIds }, lockedBy: opts.workerId, status: "RUNNING" as const };
  await db.job.updateMany({ where: held, data: { heartbeatAt: opts.now ?? new Date() } });
  const rows = await db.job.findMany({ where: held, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

function heldBy(job: Pick<Job, "id">, workerId: string): Prisma.JobWhereInput {
  return { id: job.id, lockedBy: workerId, status: "RUNNING" };
}

/** The wait before attempt `attempt + 1`: 1, 5, 25 minutes, at most an hour, with ±20% jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(60_000 * 5 ** Math.max(0, attempt - 1), 3_600_000);
  return Math.round(base * (0.8 + 0.4 * random()));
}

export type JobFailure = { message: string; code?: string };

const MAX_ERROR_LENGTH = 1000;

/** Each returns false when this process no longer held the job; nothing was written then. */
export async function markSucceeded(
  db: Db,
  job: Job,
  workerId: string,
  result: Prisma.InputJsonValue | undefined,
  now: Date = new Date()
): Promise<boolean> {
  const { count } = await db.job.updateMany({
    where: heldBy(job, workerId),
    data: {
      status: "SUCCEEDED",
      finishedAt: now,
      activeKey: null,
      result: result ?? Prisma.DbNull,
      lastError: null,
      errorCode: null,
    },
  });
  return count === 1;
}

export async function markRetry(
  db: Db,
  job: Job,
  workerId: string,
  failure: JobFailure,
  now: Date = new Date(),
  delayMs: number = backoffMs(job.attempts)
): Promise<boolean> {
  const { count } = await db.job.updateMany({
    where: heldBy(job, workerId),
    data: {
      status: "QUEUED",
      runAt: new Date(now.getTime() + delayMs),
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      lastError: failure.message.slice(0, MAX_ERROR_LENGTH),
      errorCode: failure.code ?? null,
    },
  });
  return count === 1;
}

export async function markFailed(
  db: Db,
  job: Job,
  workerId: string,
  failure: JobFailure,
  now: Date = new Date()
): Promise<boolean> {
  const { count } = await db.job.updateMany({
    where: heldBy(job, workerId),
    data: {
      status: "FAILED",
      finishedAt: now,
      activeKey: null,
      heartbeatAt: null,
      lastError: failure.message.slice(0, MAX_ERROR_LENGTH),
      errorCode: failure.code ?? null,
    },
  });
  return count === 1;
}

/** Back to the queue without counting the attempt: the process is shutting down. */
export async function releaseJob(
  db: Db,
  job: Job,
  workerId: string,
  now: Date = new Date()
): Promise<boolean> {
  const { count } = await db.job.updateMany({
    where: heldBy(job, workerId),
    data: {
      status: "QUEUED",
      runAt: now,
      attempts: { decrement: 1 },
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
    },
  });
  return count === 1;
}

/**
 * Jobs whose process stopped sending heartbeats go back to the queue, or fail
 * when they are out of attempts. Each is changed only if its row still shows
 * the heartbeat that was read, so a process that wakes up in between keeps it.
 */
export async function recoverStaleJobs(
  db: Db,
  opts: { now?: Date; staleMs?: number; siteId?: string; random?: () => number } = {}
): Promise<{ requeued: number; failed: number }> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (opts.staleMs ?? queueConfig().staleMs));
  const stale = await db.job.findMany({
    where: {
      status: "RUNNING",
      ...(opts.siteId && { siteId: opts.siteId }),
      OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, lockedAt: { lt: cutoff } }],
    },
  });

  let requeued = 0;
  let failed = 0;
  for (const job of stale) {
    const retry = job.attempts < job.maxAttempts;
    const { count } = await db.job.updateMany({
      where: { id: job.id, status: "RUNNING", lockedBy: job.lockedBy, heartbeatAt: job.heartbeatAt },
      data: retry
        ? {
            status: "QUEUED",
            runAt: new Date(now.getTime() + backoffMs(job.attempts, opts.random)),
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            lastError: INTERRUPTED_JOB_MESSAGE,
            errorCode: "INTERRUPTED",
          }
        : {
            status: "FAILED",
            finishedAt: now,
            activeKey: null,
            heartbeatAt: null,
            lastError: INTERRUPTED_JOB_MESSAGE,
            errorCode: "INTERRUPTED",
          },
    });
    if (count === 0) continue;
    if (retry) requeued++;
    else failed++;
    try {
      await getJobHandler(job.type)?.onInterrupted?.(db, job);
    } catch (err) {
      console.error(`[jobs] cleanup of interrupted ${job.type} job ${job.id} failed:`, err);
    }
  }
  return { requeued, failed };
}
