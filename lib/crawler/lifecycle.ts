import type { CrawlStatus, Prisma, PrismaClient } from "@prisma/client";

/*
 * Crawls run as jobs (lib/jobs): a crawl attempt creates its Crawl row and
 * links it to its job, and the job queue notices a process that died through
 * the job's heartbeat (lib/jobs/queue.ts recoverStaleJobs).
 *
 * Crawls from before the queue (v0.2.7 and older) have no job. If the process
 * that ran one died, nothing moves the row out of RUNNING (#57). The rules
 * below find such crawls and mark them FAILED; they never touch a crawl that
 * belongs to a job.
 */

/** Crawls that are not finished. */
export const ACTIVE_CRAWL_STATUSES: CrawlStatus[] = ["PENDING", "RUNNING"];

/**
 * The engine records progress at most every 5 s and at least once per batch of
 * fetches, per sitemap fetch, per chunk of results it stores and every 5 s of a
 * Crawl-delay wait. A request takes at most a 12 s timeout per redirect hop
 * (six hops at most) plus DNS lookups, so a live crawl goes quiet for well
 * under five minutes. Five minutes without progress means it is gone.
 */
export const STALE_AFTER_MS = 5 * 60_000;

/**
 * A crawl that started before this process did belonged to a process that is
 * gone, unless another live process runs it. Such a crawl still records
 * progress within a minute, so a minute of silence is enough here.
 */
export const RESTART_GRACE_MS = 60_000;

export const INTERRUPTED_MESSAGE =
  "Interrupted: the server restarted or the crawl stopped responding";

/** When this process started, not when this module loaded. */
export const PROCESS_STARTED_AT = new Date(Date.now() - process.uptime() * 1000);

type Db = Pick<PrismaClient, "crawl">;

/**
 * The crawl's last sign of life is before `t`. Rows from before lastProgressAt
 * existed fall back to startedAt.
 */
function quietSince(t: Date): Prisma.CrawlWhereInput {
  return {
    OR: [
      { lastProgressAt: { lt: t } },
      { lastProgressAt: null, startedAt: { lt: t } },
    ],
  };
}

/** PENDING or RUNNING crawls without a job whose process is gone. */
export function staleCrawlWhere(
  now: Date = new Date(),
  processStartedAt: Date = PROCESS_STARTED_AT
): Prisma.CrawlWhereInput {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  return {
    status: { in: ACTIVE_CRAWL_STATUSES },
    // A crawl that belongs to a job is recovered through the job.
    jobs: { none: {} },
    OR: [
      quietSince(ago(STALE_AFTER_MS)),
      // Never started and never recorded progress: a PENDING row from before
      // lastProgressAt existed.
      { lastProgressAt: null, startedAt: null },
      { startedAt: { lt: processStartedAt }, ...quietSince(ago(RESTART_GRACE_MS)) },
    ],
  };
}

/** Marks stale crawls FAILED. Scope it to one site or crawl, or leave it open on startup. */
export async function recoverStaleCrawls(
  db: Db,
  opts: { siteId?: string; crawlId?: string; now?: Date; processStartedAt?: Date } = {}
): Promise<number> {
  const now = opts.now ?? new Date();
  const { count } = await db.crawl.updateMany({
    where: {
      ...(opts.siteId && { siteId: opts.siteId }),
      ...(opts.crawlId && { id: opts.crawlId }),
      ...staleCrawlWhere(now, opts.processStartedAt),
    },
    data: { status: "FAILED", finishedAt: now, error: INTERRUPTED_MESSAGE },
  });
  return count;
}

/**
 * On server start (web app and MCP server): every crawl without a job that this
 * process could not have started and that has gone quiet is marked FAILED.
 * Never throws, so a database that is down does not stop the server from
 * starting.
 */
export async function recoverCrawlsOnStartup(db: Db, log: (msg: string) => void = console.error) {
  try {
    const n = await recoverStaleCrawls(db);
    if (n > 0) log(`Marked ${n} interrupted crawl(s) as failed`);
  } catch (err) {
    log(`Stale crawl recovery failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Crawls this process is running, so they can be stopped (account deletion).
 * On globalThis like the Prisma client in lib/db.ts: a route handler and a
 * server action may load separate copies of this module.
 */
const crawlRegistry = globalThis as unknown as { crawlseoRunningCrawls?: Map<string, AbortController> };
const runningCrawls = (crawlRegistry.crawlseoRunningCrawls ??= new Map<string, AbortController>());

/** Registers a crawl this process runs. Returns the function that unregisters it. */
export function trackRunningCrawl(crawlId: string, controller: AbortController): () => void {
  runningCrawls.set(crawlId, controller);
  return () => {
    if (runningCrawls.get(crawlId) === controller) runningCrawls.delete(crawlId);
  };
}

/**
 * Stops the crawls with these ids that run in this process. A crawl another
 * process runs (the worker) stops at its next heartbeat once its job row is
 * gone, or fails at its next write once its crawl row is gone.
 */
export function stopCrawls(crawlIds: string[], reason = "Stopped"): number {
  let stopped = 0;
  for (const id of crawlIds) {
    const controller = runningCrawls.get(id);
    if (!controller) continue;
    controller.abort(new Error(reason));
    runningCrawls.delete(id);
    stopped++;
  }
  return stopped;
}
