import type { CrawlStatus, Prisma, PrismaClient } from "@prisma/client";
import { runSiteCrawl } from "./engine";

/*
 * A crawl runs inside the process that started it: there is no queue. If that
 * process dies (restart, deploy, crash, OOM kill), nothing moves the row out of
 * RUNNING, and the one-crawl-per-site guard used to refuse every new crawl
 * from then on (#57). The rules below find such crawls and mark them FAILED.
 * Every place that starts a crawl or shows crawl status applies them first.
 */

/** Crawls that block a new one for the same site. */
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
 * gone, unless another live process runs it: the MCP server and the web app
 * are separate processes and either can start while the other is crawling.
 * Such a crawl still records progress within a minute, so a minute of silence
 * is enough here.
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

/** PENDING or RUNNING crawls whose process is gone. */
export function staleCrawlWhere(
  now: Date = new Date(),
  processStartedAt: Date = PROCESS_STARTED_AT
): Prisma.CrawlWhereInput {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  return {
    status: { in: ACTIVE_CRAWL_STATUSES },
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
 * On server start (web app and MCP server): every crawl this process could not
 * have started and that has gone quiet is marked FAILED. Never throws, so a
 * database that is down does not stop the server from starting.
 */
export async function recoverCrawlsOnStartup(db: Db, log: (msg: string) => void = console.error) {
  try {
    const n = await recoverStaleCrawls(db);
    if (n > 0) log(`Marked ${n} interrupted crawl(s) as failed`);
  } catch (err) {
    log(`Stale crawl recovery failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export type StartCrawlResult =
  | { started: true; crawlId: string }
  | { started: false; runningCrawlId: string };

/**
 * The one way to start a crawl (API route and MCP): recover stale crawls, refuse
 * if one is still running, otherwise create the row and run the crawl in the
 * background.
 */
export async function startSiteCrawl(
  db: Db,
  site: { id: string; domain: string },
  maxPages?: number
): Promise<StartCrawlResult> {
  await recoverStaleCrawls(db, { siteId: site.id });

  const running = await db.crawl.findFirst({
    where: { siteId: site.id, status: { in: ACTIVE_CRAWL_STATUSES } },
    select: { id: true },
  });
  if (running) return { started: false, runningCrawlId: running.id };

  const crawl = await db.crawl.create({
    data: {
      siteId: site.id,
      status: "PENDING",
      lastProgressAt: new Date(),
      ...(maxPages && { maxPages }),
    },
  });

  // Fire-and-forget: the crawl runs in this process, on the row created above.
  runSiteCrawl(site.id, site.domain, maxPages, crawl.id).catch((error) => {
    console.error(`Background crawl failed for site ${site.id}:`, error);
  });

  return { started: true, crawlId: crawl.id };
}

/**
 * What the crawl screens show besides the latest completed crawl: a crawl in
 * progress, or the failure of the last attempt since that crawl.
 */
export async function getCrawlActivity(
  db: Db,
  siteId: string,
  lastCompletedAt: Date | null
) {
  await recoverStaleCrawls(db, { siteId });

  const active = await db.crawl.findFirst({
    where: { siteId, status: { in: ACTIVE_CRAWL_STATUSES } },
    select: { id: true },
  });
  const failed = active
    ? null
    : await db.crawl.findFirst({
        where: {
          siteId,
          status: "FAILED",
          ...(lastCompletedAt && { finishedAt: { gt: lastCompletedAt } }),
        },
        orderBy: { finishedAt: { sort: "desc", nulls: "last" } },
        select: { id: true, error: true, finishedAt: true },
      });

  return { active, failed };
}
