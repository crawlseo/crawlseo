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
 *   the scheduler first saw the site for that type, and never sooner than one
 *   interval after the site's last crawl or vitals check from before. "First
 *   saw" is the first pass on this database that could schedule the type (it
 *   was enabled and allowed on that host), or the site's creation if later.
 *   An upgrade, turning a type on after weeks off, or moving from a
 *   serverless host to Docker therefore does not start crawling every site
 *   at once.
 *
 * Each user can change the crawl and vitals intervals of their own sites in
 * Settings > Schedule (UserSettings, lib/user-settings.ts): another number of
 * days, or off. The SCHEDULE_* value is the default for everyone else, and a
 * type the server turned off (0, or SCHEDULER_ENABLED=false) stays off
 * whatever a user set.
 *
 * A fork adds schedules of its own (registerSchedule), leaves sites out of
 * every schedule (registerScheduleFilter) and runs short upkeep once per pass
 * (registerSchedulerTask), from extensions/index.ts, without editing this file.
 */

type Db = PrismaClient;

/** How many sites' due rules run at once. */
const DUE_RULE_BATCH = 10;

const DAY_MS = 24 * 60 * 60_000;

/** Processes share one scheduling pass per this interval. */
export const SCHEDULER_EVERY_MS = 10 * 60_000;

const LAST_RUN_KEY = "lastRunAt";
/** Per job type: the first pass that could schedule that type. */
const firstSeenKey = (type: string) => `firstSeenAt:${type}`;

/** Up to 2 hours, and at most a tenth of the interval. */
export function slackMs(intervalMs: number): number {
  return Math.min(2 * 60 * 60_000, Math.floor(intervalMs / 10));
}

/** Where in the first interval a site's first scheduled job of a type falls: stable per site and type. */
export function firstRunOffsetMs(siteId: string, type: string, intervalMs: number): number {
  const hash = createHash("sha256").update(`${type}:${siteId}`).digest();
  return hash.readUIntBE(0, 6) % Math.max(1, intervalMs);
}

/** A site as the scheduler sees it. */
export type ScheduledSite = {
  id: string;
  userId: string;
  createdAt: Date;
  gscProperty: string | null;
  bingSite: string | null;
};
type Site = ScheduledSite;

/**
 * The due rule of a registered schedule. `lastQueuedAt`: when the site's
 * newest job of the type was queued, null if never. `firstSeenAt`: the first
 * pass on this database that could schedule the type.
 */
export type DueRule = (
  site: ScheduledSite,
  ctx: { now: Date; lastQueuedAt: Date | null; firstSeenAt: Date }
) => boolean | Promise<boolean>;

/** Per user: the crawl and vitals intervals set in Settings, in days (null: the server default). */
type UserIntervals = Map<string, { crawlScheduleDays: number | null; vitalsScheduleDays: number | null }>;

type PassContext = { bingKeyUsers: Set<string>; userIntervals: UserIntervals };

type Schedule = {
  type: string;
  intervalMs: number;
  applies: (site: Site, ctx: PassContext) => boolean;
  /** The interval of this site when it can differ from intervalMs (a user's setting). 0: not scheduled. */
  siteIntervalMs?: (site: Site, ctx: PassContext) => number;
  /** Crawls and vitals: spread the first run instead of running it at once. */
  spreadFirst: boolean;
  /** Replaces the interval rule. */
  isDue?: DueRule;
};

/**
 * A schedule a fork registers. Its job type must be registered too
 * (registerJobHandler). Either `intervalMs` (the same rule as the built-in
 * schedules) or `isDue` decides when a site is due. A registered schedule
 * with the type of a built-in one replaces it entirely: the SCHEDULE_* env
 * interval, the built-in `applies` (such as "has a Search Console property")
 * and `spreadFirst` no longer apply unless it sets them itself.
 */
export type CustomSchedule = {
  type: string;
  /** Which sites it covers; every site by default. */
  applies?: (site: ScheduledSite) => boolean;
  intervalMs?: number;
  /** With intervalMs: spread each site's first run over the first interval. */
  spreadFirst?: boolean;
  isDue?: DueRule;
};

/** Gets every site a pass would schedule, returns those it may schedule. Throwing skips the pass's scheduling. */
export type ScheduleFilter = (sites: ScheduledSite[], ctx: { now: Date }) => ScheduledSite[] | Promise<ScheduledSite[]>;

/**
 * Upkeep that runs once per scheduling pass across processes, after the
 * pass has queued its jobs. Keep it short: after SCHEDULER_TASK_TIMEOUT_MS
 * the pass stops waiting for it. Queue a job for long work.
 */
export type SchedulerTask = (db: Db, ctx: { now: Date }) => Promise<void>;

/** On globalThis like the job handler registry: a route and a server action may load separate copies of this module. */
const extras = globalThis as unknown as {
  crawlseoSchedules?: Map<string, CustomSchedule>;
  crawlseoScheduleFilters?: Set<ScheduleFilter>;
  crawlseoSchedulerTasks?: Map<string, SchedulerTask>;
};
const customSchedules = (extras.crawlseoSchedules ??= new Map());
const scheduleFilters = (extras.crawlseoScheduleFilters ??= new Set());
const schedulerTasks = (extras.crawlseoSchedulerTasks ??= new Map());

/** Adds a schedule, or replaces the one of the same type. Returns a function that removes it. */
export function registerSchedule(schedule: CustomSchedule): () => void {
  if (!schedule.type.trim()) throw new Error("A schedule needs a job type");
  const hasInterval = Number.isFinite(schedule.intervalMs) && (schedule.intervalMs ?? 0) > 0;
  if (!schedule.isDue && !hasInterval) {
    throw new Error(`Schedule ${schedule.type}: give a positive intervalMs or an isDue rule`);
  }
  customSchedules.set(schedule.type, schedule);
  return () => {
    if (customSchedules.get(schedule.type) === schedule) customSchedules.delete(schedule.type);
  };
}

/** Adds a filter every pass applies to the sites before any schedule. Returns a function that removes it. */
export function registerScheduleFilter(filter: ScheduleFilter): () => void {
  scheduleFilters.add(filter);
  return () => {
    scheduleFilters.delete(filter);
  };
}

/** Adds a task, or replaces the one of the same name. Returns a function that removes it. */
export function registerSchedulerTask(name: string, task: SchedulerTask): () => void {
  if (!name.trim()) throw new Error("A scheduler task needs a name");
  schedulerTasks.set(name, task);
  return () => {
    if (schedulerTasks.get(name) === task) schedulerTasks.delete(name);
  };
}

function schedules(config: ScheduleConfig): Schedule[] {
  const custom = [...customSchedules.values()].map(
    (c): Schedule => ({
      type: c.type,
      intervalMs: c.intervalMs ?? 0,
      spreadFirst: c.spreadFirst ?? false,
      applies: (site) => (c.applies ? c.applies(site) : true),
      isDue: c.isDue,
    })
  );
  const replaced = new Set(custom.map((c) => c.type));
  return [...builtInSchedules(config).filter((b) => !replaced.has(b.type)), ...custom];
}

function builtInSchedules(config: ScheduleConfig): Schedule[] {
  return [
    { type: GSC_SYNC_JOB, intervalMs: config.gscSyncMs, spreadFirst: false, applies: (s) => Boolean(s.gscProperty) },
    {
      type: BING_SYNC_JOB,
      intervalMs: config.bingSyncMs,
      spreadFirst: false,
      applies: (s, ctx) => Boolean(s.bingSite) && ctx.bingKeyUsers.has(s.userId),
    },
    {
      type: CRAWL_JOB,
      intervalMs: config.crawlMs,
      spreadFirst: true,
      applies: () => true,
      siteIntervalMs: (s, ctx) => userInterval(ctx.userIntervals.get(s.userId)?.crawlScheduleDays, config.crawlMs),
    },
    {
      type: VITALS_JOB,
      intervalMs: config.vitalsMs,
      spreadFirst: true,
      applies: () => true,
      siteIntervalMs: (s, ctx) => userInterval(ctx.userIntervals.get(s.userId)?.vitalsScheduleDays, config.vitalsMs),
    },
  ];
}

/** A user's interval in days, or the server's when they set none. */
function userInterval(days: number | null | undefined, serverMs: number): number {
  return days === null || days === undefined || !Number.isFinite(days) || days < 0 ? serverMs : days * DAY_MS;
}

/**
 * Takes this pass if no process ran one in the last SCHEDULER_EVERY_MS. One
 * UPDATE with the age in its WHERE: of two processes racing, the second one's
 * UPDATE sees the first one's timestamp and changes nothing.
 */
async function takePass(db: Db, now: Date, force: boolean): Promise<boolean> {
  await db.schedulerState.createMany({ data: [{ key: LAST_RUN_KEY, at: new Date(0) }], skipDuplicates: true });
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

/** A task still running after this is logged and left behind, so the pass can end. */
export const SCHEDULER_TASK_TIMEOUT_MS = 30_000;

async function runTasks(db: Db, now: Date): Promise<void> {
  for (const [name, task] of schedulerTasks) {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), SCHEDULER_TASK_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      const outcome = await Promise.race([task(db, { now }).then(() => "done" as const), timeout]);
      if (outcome === "timeout") {
        console.error(`[jobs] scheduler task ${name} still running after ${SCHEDULER_TASK_TIMEOUT_MS / 1000} s; not waiting for it`);
      }
    } catch (err) {
      console.error(`[jobs] scheduler task ${name} failed:`, err);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The sites every registered filter lets through, or null when a filter failed (nothing is scheduled then). */
async function filterSites(sites: Site[], now: Date): Promise<Site[] | null> {
  let kept = sites;
  for (const filter of scheduleFilters) {
    try {
      const allowed = new Set((await filter(kept, { now })).map((s) => s.id));
      kept = kept.filter((s) => allowed.has(s.id));
    } catch (err) {
      console.error("[jobs] schedule filter failed; nothing is scheduled on this pass:", err);
      return null;
    }
  }
  return kept;
}

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
  // Tasks run after the built-in work, so a slow one never holds it up.
  if (config.enabled) await scheduleSites(db, config, allowed, now, queued);
  await runTasks(db, now);
  return { ran: true, queued, deleted };
}

async function scheduleSites(
  db: Db,
  config: ScheduleConfig,
  allowed: Set<string>,
  now: Date,
  queued: Record<string, number>
): Promise<void> {
  const all: Site[] = await db.site.findMany({
    select: { id: true, userId: true, createdAt: true, gscProperty: true, bingSite: true },
    orderBy: { createdAt: "asc" },
  });
  const sites = all.length ? await filterSites(all, now) : all;
  if (!sites || sites.length === 0) return;
  const bingKeyUsers = new Set(
    (await db.apiKey.findMany({ where: { provider: "bing" }, select: { userId: true } })).map((k) => k.userId)
  );
  const userIntervals: UserIntervals = new Map(
    (
      await db.userSettings.findMany({
        where: { OR: [{ crawlScheduleDays: { not: null } }, { vitalsScheduleDays: { not: null } }] },
        select: { userId: true, crawlScheduleDays: true, vitalsScheduleDays: true },
      })
    ).map(({ userId, ...days }) => [userId, days])
  );

  for (const schedule of schedules(config)) {
    // Off on this server: no user setting turns it back on.
    if ((schedule.intervalMs <= 0 && !schedule.isDue) || !allowed.has(schedule.type)) continue;
    const firstSeenAt = await firstSeen(db, schedule.type, now);
    const due = await dueSites(db, schedule, sites, { now, firstSeenAt, bingKeyUsers, userIntervals });
    for (const site of due) {
      try {
        const created = await queueScheduled(db, schedule.type, site);
        if (created) queued[schedule.type] = (queued[schedule.type] ?? 0) + 1;
      } catch (err) {
        console.error(`[jobs] could not schedule ${schedule.type} for site ${site.id}:`, err);
      }
    }
  }
}

/**
 * When the scheduler first could schedule this type here, recorded on the
 * first such pass. Only called for a type that is enabled and allowed on this
 * pass, so a pass that skips it (scheduler or type off, or a serverless host
 * for LONG types) never starts its clock.
 */
async function firstSeen(db: Db, type: string, now: Date): Promise<Date> {
  const key = firstSeenKey(type);
  await db.schedulerState.createMany({ data: [{ key, at: now }], skipDuplicates: true });
  return (await db.schedulerState.findUniqueOrThrow({ where: { key } })).at;
}

async function dueSites(
  db: Db,
  schedule: Schedule,
  sites: Site[],
  ctx: PassContext & { now: Date; firstSeenAt: Date }
): Promise<Site[]> {
  const { type } = schedule;
  const latest = new Map(
    (await db.job.groupBy({ by: ["siteId"], where: { type }, _max: { createdAt: true } })).map((r) => [
      r.siteId,
      r._max.createdAt,
    ])
  );
  if (schedule.isDue) {
    const isDue = schedule.isDue;
    const applicable = sites.filter((site) => schedule.applies(site, ctx));
    const due: Site[] = [];
    // A few at a time: a rule that queries the database must not exhaust its pool.
    for (let i = 0; i < applicable.length; i += DUE_RULE_BATCH) {
      const batch = applicable.slice(i, i + DUE_RULE_BATCH);
      const results = await Promise.all(
        batch.map(async (site) => {
          try {
            return await isDue(site, { now: ctx.now, lastQueuedAt: latest.get(site.id) ?? null, firstSeenAt: ctx.firstSeenAt });
          } catch (err) {
            console.error(`[jobs] due rule of ${type} failed for site ${site.id}:`, err);
            return false;
          }
        })
      );
      due.push(...batch.filter((_, j) => results[j]));
    }
    return due;
  }
  const before = schedule.spreadFirst ? await lastRunBeforeQueue(db, type) : new Map<string, Date>();
  const now = ctx.now.getTime();

  return sites.filter((site) => {
    if (!schedule.applies(site, ctx)) return false;
    const intervalMs = schedule.siteIntervalMs?.(site, ctx) ?? schedule.intervalMs;
    if (intervalMs <= 0) return false;
    const slack = slackMs(intervalMs);
    const last = latest.get(site.id);
    if (last) return now - last.getTime() >= intervalMs - slack;
    if (!schedule.spreadFirst) return true;
    const seen = Math.max(ctx.firstSeenAt.getTime(), site.createdAt.getTime());
    let dueAt = seen + firstRunOffsetMs(site.id, type, intervalMs);
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

