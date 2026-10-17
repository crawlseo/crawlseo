import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { scheduleConfig, type ScheduleConfig } from "./config";
import { BING_SYNC_JOB, CRAWL_JOB, GSC_SYNC_JOB, jobTypes, VITALS_JOB } from "./handlers";
import { DEFAULT_CRAWL_PAGES } from "./policy";
import { enqueueJob } from "./queue";
import { requestCrawl } from "./site-jobs";

/*
 * Queues the regular work per site: GSC and Bing syncs daily, a crawl and a
 * vitals check weekly (intervals from SCHEDULE_*). Jobs are queued only once
 * they are due, never ahead of time, so a waiting scheduled job never holds a
 * site's active slot for long.
 *
 * Due: the newest job of that type for the site is at least one interval old
 * (minus a little slack, so a daily run that drifts a few minutes earlier
 * does not skip a day). A site with no job of a type yet:
 * - GSC and Bing syncs are due at once.
 * - Crawl and vitals are due at a fixed offset into the first interval after
 *   the scheduler first saw the site (its first run on this database, or the
 *   site's creation if later), and never sooner than one interval after the
 *   site's last crawl or vitals check from before. An upgrade therefore does
 *   not start crawling every site at once.
 */

type Db = PrismaClient;

/** Processes share one scheduling pass per this interval. */
export const SCHEDULER_EVERY_MS = 10 * 60_000;

const FIRST_RUN_KEY = "firstRunAt";
const LAST_RUN_KEY = "lastRunAt";

/** Up to 2 hours, and at most a tenth of the interval. */
export function slackMs(intervalMs: number): number {
  return Math.min(2 * 60 * 60_000, Math.floor(intervalMs / 10));
}

/** Where in the first interval a site's first scheduled job of a type falls: stable per site and type. */
export function firstRunOffsetMs(siteId: string, type: string, intervalMs: number): number {
  const hash = createHash("sha256").update(`${type}:${siteId}`).digest();
  return hash.readUIntBE(0, 6) % Math.max(1, intervalMs);
}

type Site = {
  id: string;
  userId: string;
  createdAt: Date;
  gscProperty: string | null;
  bingSite: string | null;
};

type Schedule = {
  type: string;
  intervalMs: number;
  applies: (site: Site, ctx: { bingKeyUsers: Set<string> }) => boolean;
  /** Crawls and vitals: spread the first run instead of running it at once. */
  spreadFirst: boolean;
};

function schedules(config: ScheduleConfig): Schedule[] {
  return [
    { type: GSC_SYNC_JOB, intervalMs: config.gscSyncMs, spreadFirst: false, applies: (s) => Boolean(s.gscProperty) },
    {
      type: BING_SYNC_JOB,
      intervalMs: config.bingSyncMs,
      spreadFirst: false,
      applies: (s, ctx) => Boolean(s.bingSite) && ctx.bingKeyUsers.has(s.userId),
    },
    { type: CRAWL_JOB, intervalMs: config.crawlMs, spreadFirst: true, applies: () => true },
    { type: VITALS_JOB, intervalMs: config.vitalsMs, spreadFirst: true, applies: () => true },
  ];
}

/**
 * Takes this pass if no process ran one in the last SCHEDULER_EVERY_MS. One
 * UPDATE with the age in its WHERE: of two processes racing, the second one's
 * UPDATE sees the first one's timestamp and changes nothing.
 */
async function takePass(db: Db, now: Date, force: boolean): Promise<boolean> {
  await db.schedulerState.createMany({
    data: [
      { key: FIRST_RUN_KEY, at: now },
      { key: LAST_RUN_KEY, at: new Date(0) },
    ],
    skipDuplicates: true,
  });
  const { count } = await db.schedulerState.updateMany({
    where: { key: LAST_RUN_KEY, ...(!force && { at: { lte: new Date(now.getTime() - SCHEDULER_EVERY_MS) } }) },
    data: { at: now },
  });
  return count === 1;
}

/**
 * Deletes finished jobs older than the retention period, except the newest one
 * of each type per site: the scheduler measures the next run from it.
 */
async function deleteOldJobs(db: Db, now: Date, retentionMs: number): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionMs).toISOString();
  return db.$executeRaw`
    DELETE FROM "Job" AS j
    WHERE j."status" IN ('SUCCEEDED', 'FAILED')
      AND j."finishedAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
      AND EXISTS (
        SELECT 1 FROM "Job" AS n
        WHERE n."siteId" = j."siteId" AND n."type" = j."type" AND n."createdAt" > j."createdAt"
      )`;
}

export type SchedulerResult = { ran: boolean; queued: Record<string, number>; deleted: number };

/**
 * One scheduling pass. `types` limits which job types it queues (a serverless
 * host queues only SHORT ones: nothing runs LONG jobs there on a schedule).
 * Skips, returning ran: false, when another process ran one recently.
 */
export async function runScheduler(
  db: Db,
  opts: { now?: Date; config?: ScheduleConfig; types?: string[]; force?: boolean } = {}
): Promise<SchedulerResult> {
  const now = opts.now ?? new Date();
  const config = opts.config ?? scheduleConfig();
  const allowed = new Set(opts.types ?? jobTypes());
  const queued: Record<string, number> = {};
  if (!(await takePass(db, now, opts.force ?? false))) return { ran: false, queued, deleted: 0 };

  const deleted = await deleteOldJobs(db, now, config.retentionMs);
  if (!config.enabled) return { ran: true, queued, deleted };

  const firstRun = await db.schedulerState.findUniqueOrThrow({ where: { key: FIRST_RUN_KEY } });
  const sites: Site[] = await db.site.findMany({
    select: { id: true, userId: true, createdAt: true, gscProperty: true, bingSite: true },
    orderBy: { createdAt: "asc" },
  });
  if (sites.length === 0) return { ran: true, queued, deleted };
  const bingKeyUsers = new Set(
    (await db.apiKey.findMany({ where: { provider: "bing" }, select: { userId: true } })).map((k) => k.userId)
  );

  for (const schedule of schedules(config)) {
    if (schedule.intervalMs <= 0 || !allowed.has(schedule.type)) continue;
    const due = await dueSites(db, schedule, sites, { now, firstRunAt: firstRun.at, bingKeyUsers });
    for (const site of due) {
      try {
        const created = await queueScheduled(db, schedule.type, site);
        if (created) queued[schedule.type] = (queued[schedule.type] ?? 0) + 1;
      } catch (err) {
        console.error(`[jobs] could not schedule ${schedule.type} for site ${site.id}:`, err);
      }
    }
  }
  return { ran: true, queued, deleted };
}

async function dueSites(
  db: Db,
  schedule: Schedule,
  sites: Site[],
  ctx: { now: Date; firstRunAt: Date; bingKeyUsers: Set<string> }
): Promise<Site[]> {
  const { type, intervalMs } = schedule;
  const latest = new Map(
    (await db.job.groupBy({ by: ["siteId"], where: { type }, _max: { createdAt: true } })).map((r) => [
      r.siteId,
      r._max.createdAt,
    ])
  );
  const before = schedule.spreadFirst ? await lastRunBeforeQueue(db, type) : new Map<string, Date>();
  const slack = slackMs(intervalMs);
  const now = ctx.now.getTime();

  return sites.filter((site) => {
    if (!schedule.applies(site, ctx)) return false;
    const last = latest.get(site.id);
    if (last) return now - last.getTime() >= intervalMs - slack;
    if (!schedule.spreadFirst) return true;
    const firstSeen = Math.max(ctx.firstRunAt.getTime(), site.createdAt.getTime());
    let dueAt = firstSeen + firstRunOffsetMs(site.id, type, intervalMs);
    const previous = before.get(site.id);
    if (previous) dueAt = Math.max(dueAt, previous.getTime() + intervalMs - slack);
    return now >= dueAt;
  });
}

/** The last crawl or vitals check per site, from rows that need no job (before the queue, too). */
async function lastRunBeforeQueue(db: Db, type: string): Promise<Map<string, Date>> {
  if (type === CRAWL_JOB) {
    const rows = await db.crawl.groupBy({ by: ["siteId"], _max: { startedAt: true } });
    return new Map(rows.flatMap((r) => (r._max.startedAt ? [[r.siteId, r._max.startedAt] as const] : [])));
  }
  if (type === VITALS_JOB) {
    const rows = await db.vitalsReport.groupBy({ by: ["siteId"], _max: { date: true } });
    return new Map(rows.flatMap((r) => (r._max.date ? [[r.siteId, r._max.date] as const] : [])));
  }
  return new Map();
}

async function queueScheduled(db: Db, type: string, site: Site): Promise<boolean> {
  if (type === CRAWL_JOB) {
    // The same page count as the site's last crawl, through the crawl policy.
    const last = await db.crawl.findFirst({
      where: { siteId: site.id },
      orderBy: { startedAt: { sort: "desc", nulls: "last" } },
      select: { maxPages: true },
    });
    const result = await requestCrawl(db, site, { maxPages: last?.maxPages ?? DEFAULT_CRAWL_PAGES, source: "schedule" });
    if (result.status === "refused") console.log(`[jobs] scheduled crawl for site ${site.id} refused: ${result.reason}`);
    return result.status === "queued";
  }
  const { created } = await enqueueJob(db, { type, siteId: site.id, source: "schedule" });
  return created;
}

/** The job loop's maintenance hook: a scheduling pass, logged when it queued something. */
export function scheduleOnMaintenance(db: Db, log: (msg: string) => void = console.log): () => Promise<void> {
  return async () => {
    const { ran, queued, deleted } = await runScheduler(db);
    if (!ran) return;
    const parts = Object.entries(queued).map(([type, n]) => `${n} ${type}`);
    if (parts.length) log(`[jobs] scheduled ${parts.join(", ")}`);
    if (deleted) log(`[jobs] deleted ${deleted} finished job(s) past retention`);
  };
}

