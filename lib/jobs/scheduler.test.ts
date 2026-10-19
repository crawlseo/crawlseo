import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The scheduler against the real Prisma client on PGlite, with an explicit
// clock: due rules, the spread of first crawls and vitals checks after an
// upgrade, and the shared pass between processes.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { scheduleConfig, type ScheduleConfig } from "./config";
import { jobTypes, registerJobHandler } from "./handlers";
import {
  firstRunOffsetMs,
  registerSchedule,
  registerScheduleFilter,
  registerSchedulerTask,
  runScheduler,
  SCHEDULER_EVERY_MS,
  SCHEDULER_TASK_TIMEOUT_MS,
  slackMs,
} from "./scheduler";
import { requestCrawl } from "./site-jobs";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 17, 4, 0, 0); // the scheduler's first run (the upgrade)
const at = (ms: number) => new Date(T0 + ms);
const SITES = Array.from({ length: 20 }, (_, i) => `site-${String(i).padStart(2, "0")}`);
const config: ScheduleConfig = scheduleConfig({});

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.user.create({ data: { id: "u2", email: "other@quilltab.app" } });
  await db.apiKey.create({ data: { userId: "u1", provider: "bing", encryptedPassword: "x" } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  await db.crawl.deleteMany();
  await db.vitalsReport.deleteMany();
  await db.site.deleteMany();
  await db.schedulerState.deleteMany();
  for (const id of SITES) {
    // Sites from well before the upgrade, each crawled and checked a month ago.
    await db.site.create({
      data: { id, userId: "u1", domain: `${id}.example`, gscProperty: `sc-domain:${id}.example`, createdAt: at(-90 * DAY) },
    });
    await db.crawl.create({ data: { siteId: id, status: "COMPLETED", startedAt: at(-30 * DAY), maxPages: 50 } });
    await db.vitalsReport.create({ data: { siteId: id, url: `https://${id}.example`, device: "MOBILE", date: at(-30 * DAY) } });
  }
});

describe("first runs after an upgrade", () => {
  it("syncs every site at once but queues no crawl or vitals check right away", async () => {
    const result = await runScheduler(db, { now: at(0), config });
    expect(result.ran).toBe(true);
    expect(result.queued["gsc-sync"]).toBe(SITES.length);
    expect(result.queued.crawl ?? 0).toBeLessThanOrEqual(1);
    expect(result.queued.vitals ?? 0).toBeLessThanOrEqual(1);
  });

  it("spreads every site's first crawl over the first week, once each", async () => {
    // Mock the creation time: the job rows record when the pass ran.
    const queuedAt = await simulateWithClock(0, 7 * DAY, "crawl");
    expect([...queuedAt.keys()].sort()).toEqual(SITES);
    const days = new Set([...queuedAt.values()].map((ms) => Math.floor(ms / DAY)));
    expect(days.size).toBeGreaterThanOrEqual(4);
    const firstDay = [...queuedAt.values()].filter((ms) => ms < DAY).length;
    expect(firstDay).toBeLessThanOrEqual(SITES.length / 2);
    for (const [site, ms] of queuedAt) {
      // Due at its offset into the week, queued by the next pass after it.
      const offset = firstRunOffsetMs(site, "crawl", 7 * DAY);
      expect(ms).toBeGreaterThanOrEqual(offset);
      expect(ms).toBeLessThan(offset + SCHEDULER_EVERY_MS);
    }
  }, 120_000);

  it("never queues the first crawl sooner than a week after the site's last crawl from before", async () => {
    await db.crawl.create({ data: { siteId: "site-00", status: "COMPLETED", startedAt: at(-1 * DAY) } });
    const queuedAt = await simulateWithClock(0, 7 * DAY, "crawl");
    const offset = firstRunOffsetMs("site-00", "crawl", 7 * DAY);
    expect(queuedAt.get("site-00") ?? Infinity).toBeGreaterThanOrEqual(Math.max(offset, 6 * DAY - slackMs(7 * DAY)));
  }, 120_000);

  it("holds no queued job before a site is due, so a manual crawl is not refused", async () => {
    await runScheduler(db, { now: at(0), config });
    const waiting = SITES.find((s) => firstRunOffsetMs(s, "crawl", 7 * DAY) > SCHEDULER_EVERY_MS)!;
    expect(await db.job.count({ where: { siteId: waiting, type: "crawl" } })).toBe(0);
    const result = await requestCrawl(db, { id: waiting, userId: "u1" }, { maxPages: 30, source: "manual" });
    expect(result.status).toBe("queued");
  });

  it("measures a site added after the upgrade from when it was added", async () => {
    await runScheduler(db, { now: at(0), config });
    await db.site.create({ data: { id: "new-site", userId: "u1", domain: "new.example", createdAt: at(3 * DAY) } });
    const offset = firstRunOffsetMs("new-site", "crawl", 7 * DAY);
    // Hourly passes: enough to see when it is queued, fast enough for a test.
    const queuedAt = await simulateWithClock(3 * DAY, 10 * DAY + HOUR, "crawl", HOUR);
    expect(queuedAt.get("new-site")).toBeGreaterThanOrEqual(3 * DAY + offset);
    expect(queuedAt.get("new-site")).toBeLessThan(3 * DAY + offset + HOUR);
  }, 60_000);
});

describe("first-seen time per job type", () => {
  const crawlsQueued = () => db.job.count({ where: { type: "crawl" } });

  it("a scheduler that was off for weeks queues no crawl burst when turned on", async () => {
    for (let day = 0; day < 21; day++) {
      await runScheduler(db, { now: at(day * DAY), config: { ...config, enabled: false }, force: true });
    }
    expect(await db.schedulerState.count({ where: { key: { startsWith: "firstSeenAt:" } } })).toBe(0);

    const { queued } = await runScheduler(db, { now: at(21 * DAY), config, force: true });
    expect(queued.crawl ?? 0).toBeLessThanOrEqual(1);
    expect(queued.vitals ?? 0).toBeLessThanOrEqual(1);
    expect(await crawlsQueued()).toBeLessThanOrEqual(1);
  });

  it("crawls turned off for weeks queue no burst when turned on", async () => {
    for (let day = 0; day < 21; day++) {
      await runScheduler(db, { now: at(day * DAY), config: { ...config, crawlMs: 0 }, force: true });
    }
    const { queued } = await runScheduler(db, { now: at(21 * DAY), config, force: true });
    expect(queued.crawl ?? 0).toBeLessThanOrEqual(1);
  });

  it("serverless passes, then a Docker pass, queue no crawl burst", async () => {
    // A serverless host schedules SHORT types only, for two weeks.
    for (let day = 0; day < 14; day++) {
      await runScheduler(db, { now: at(day * DAY), config, types: jobTypes("SHORT"), force: true });
    }
    expect(await crawlsQueued()).toBe(0);
    expect(await db.schedulerState.findUnique({ where: { key: "firstSeenAt:crawl" } })).toBeNull();
    expect(await db.schedulerState.findUnique({ where: { key: "firstSeenAt:gsc-sync" } })).not.toBeNull();

    // Then the same database gets a worker.
    const { queued } = await runScheduler(db, { now: at(14 * DAY), config, force: true });
    expect(queued.crawl ?? 0).toBeLessThanOrEqual(1);
    expect((await db.schedulerState.findUniqueOrThrow({ where: { key: "firstSeenAt:crawl" } })).at).toEqual(at(14 * DAY));
  });
});

describe("regular runs", () => {
  it("queues the next run one interval after the last job, with slack for a daily run that drifts", async () => {
    const day = { ...config, crawlMs: 0, vitalsMs: 0 };
    await runScheduler(db, { now: at(0), config: day, force: true });
    const first = await db.job.findFirstOrThrow({ where: { siteId: "site-00", type: "gsc-sync" } });
    // Queued by the pass at T0 (Prisma fills createdAt from the real clock).
    await db.job.updateMany({ data: { status: "SUCCEEDED", activeKey: null, createdAt: at(0), finishedAt: at(MIN) } });

    // 20 hours later: not due.
    await runScheduler(db, { now: at(20 * HOUR), config: day, force: true });
    expect(await db.job.count({ where: { siteId: "site-00", type: "gsc-sync" } })).toBe(1);

    // A daily cron that fires 50 minutes earlier than yesterday still runs.
    await runScheduler(db, { now: at(DAY - 50 * MIN), config: day, force: true });
    const jobs = await db.job.findMany({ where: { siteId: "site-00", type: "gsc-sync" }, orderBy: { createdAt: "asc" } });
    expect(jobs).toHaveLength(2);
    expect(jobs[0].id).toBe(first.id);
    expect(jobs[1].source).toBe("schedule");
  });

  it("schedules Bing only for sites with a property and their owner's key", async () => {
    await db.site.update({ where: { id: "site-00" }, data: { bingSite: "https://site-00.example/" } });
    await db.site.create({ data: { id: "no-key", userId: "u2", domain: "nokey.example", bingSite: "https://nokey.example/" } });
    const { queued } = await runScheduler(db, { now: at(0), config });
    expect(queued["bing-sync"]).toBe(1);
    expect(await db.job.findFirstOrThrow({ where: { type: "bing-sync" } })).toMatchObject({ siteId: "site-00" });
  });

  it("a scheduled crawl uses the page count of the site's last crawl, within the ceiling", async () => {
    vi.stubEnv("CRAWL_MAX_PAGES", "40");
    try {
      const site = "site-03";
      const offset = firstRunOffsetMs(site, "crawl", 7 * DAY);
      await runScheduler(db, { now: at(0), config, force: true });
      await runScheduler(db, { now: at(offset), config, force: true });
      const job = await db.job.findFirstOrThrow({ where: { siteId: site, type: "crawl" } });
      expect(job).toMatchObject({ source: "schedule", priority: 0, payload: { maxPages: 40 } });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("settings and limits", () => {
  it("an interval of 0 or SCHEDULER_ENABLED=false queues nothing", async () => {
    const off = { ...config, gscSyncMs: 0, crawlMs: 0, vitalsMs: 0, bingSyncMs: 0 };
    expect((await runScheduler(db, { now: at(8 * DAY), config: off, force: true })).queued).toEqual({});
    expect((await runScheduler(db, { now: at(8 * DAY), config: { ...config, enabled: false }, force: true })).queued).toEqual({});
    expect(await db.job.count()).toBe(0);
  });

  it("queues only the types it is given (SHORT only on a serverless host)", async () => {
    const { queued } = await runScheduler(db, { now: at(8 * DAY), config, types: jobTypes("SHORT") });
    expect(Object.keys(queued)).toEqual(["gsc-sync"]);
  });

  it("runs one pass per 10 minutes across processes", async () => {
    const [a, b] = await Promise.all([
      runScheduler(db, { now: at(0), config }),
      runScheduler(db, { now: at(0), config }),
    ]);
    expect([a.ran, b.ran].sort()).toEqual([false, true]);
    expect((await runScheduler(db, { now: at(9 * MIN), config })).ran).toBe(false);
    expect((await runScheduler(db, { now: at(10 * MIN), config })).ran).toBe(true);
    expect(await db.job.count({ where: { type: "gsc-sync" } })).toBe(SITES.length);
  });

  it("deletes finished jobs past retention, but keeps the newest of each type per site", async () => {
    const old = (finishedAt: Date, createdAt: Date) =>
      db.job.create({
        data: { siteId: "site-00", type: "gsc-sync", source: "schedule", maxAttempts: 3, status: "SUCCEEDED", finishedAt, createdAt },
      });
    const oldest = await old(at(-40 * DAY), at(-40 * DAY));
    const newest = await old(at(-35 * DAY), at(-35 * DAY));
    const { deleted } = await runScheduler(db, { now: at(0), config: { ...config, enabled: false } });
    expect(deleted).toBe(1);
    expect(await db.job.findUnique({ where: { id: oldest.id } })).toBeNull();
    expect(await db.job.findUnique({ where: { id: newest.id } })).not.toBeNull();
  });
});

describe("a person's request takes over a queued scheduled job", () => {
  it("moves it to the front with the requested page count", async () => {
    const site = "site-05";
    await runScheduler(db, { now: at(0), config, force: true });
    await runScheduler(db, { now: at(firstRunOffsetMs(site, "crawl", 7 * DAY)), config, force: true });
    const scheduled = await db.job.findFirstOrThrow({ where: { siteId: site, type: "crawl" } });
    expect(scheduled.priority).toBe(0);

    const result = await requestCrawl(db, { id: site, userId: "u1" }, { maxPages: 25, source: "manual" });
    expect(result.status).toBe("active");
    expect(await db.job.findUniqueOrThrow({ where: { id: scheduled.id } })).toMatchObject({
      priority: 10,
      payload: { maxPages: 25 },
    });
  });
});

describe("schedules, filters and tasks a fork registers", () => {
  const REPORT = "test-report";
  const cleanups: (() => void)[] = [];
  const later = (fn: () => void) => cleanups.push(fn);

  beforeAll(() => {
    registerJobHandler({ type: REPORT, class: "SHORT", maxAttempts: 1, isPermanent: () => true, run: async () => undefined });
  });

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    vi.restoreAllMocks();
  });

  const reportJobs = () => db.job.findMany({ where: { type: REPORT }, select: { siteId: true } });

  it("queues a registered type for the sites its due rule picks, with the last time it was queued", async () => {
    const seen: (Date | null)[] = [];
    later(
      registerSchedule({
        type: REPORT,
        applies: (site) => site.id < "site-05",
        isDue: (site, ctx) => {
          seen.push(ctx.lastQueuedAt);
          expect(ctx.firstSeenAt).toEqual(at(0));
          return site.id !== "site-02";
        },
      })
    );
    const result = await runScheduler(db, { now: at(0), config });
    expect(result.queued[REPORT]).toBe(4);
    expect((await reportJobs()).map((j) => j.siteId).sort()).toEqual(["site-00", "site-01", "site-03", "site-04"]);
    expect(seen).toEqual([null, null, null, null, null]);

    // Next pass: the due rule sees the job it queued.
    seen.length = 0;
    await runScheduler(db, { now: at(SCHEDULER_EVERY_MS), config });
    expect(seen.filter((d) => d instanceof Date)).toHaveLength(4);
  });

  it("queues a registered type on an interval, once per interval", async () => {
    later(registerSchedule({ type: REPORT, intervalMs: DAY }));
    expect((await runScheduler(db, { now: at(0), config })).queued[REPORT]).toBe(SITES.length);
    await db.job.updateMany({ where: { type: REPORT }, data: { status: "SUCCEEDED", activeKey: null } });
    expect((await runScheduler(db, { now: at(SCHEDULER_EVERY_MS), config })).queued[REPORT]).toBeUndefined();
  });

  it("replaces the built-in schedule of the same type", async () => {
    later(registerSchedule({ type: "gsc-sync", isDue: () => false }));
    const result = await runScheduler(db, { now: at(0), config });
    expect(result.queued["gsc-sync"]).toBeUndefined();
  });

  it("refuses a schedule with neither an interval nor a due rule", () => {
    expect(() => registerSchedule({ type: REPORT })).toThrow(/intervalMs or an isDue/);
    expect(() => registerSchedule({ type: REPORT, intervalMs: 0 })).toThrow(/intervalMs or an isDue/);
  });

  it("leaves the sites a filter drops out of every schedule", async () => {
    later(registerSchedule({ type: REPORT, isDue: () => true }));
    later(registerScheduleFilter((sites) => sites.filter((s) => s.id !== "site-00")));
    const result = await runScheduler(db, { now: at(0), config });
    expect(result.queued["gsc-sync"]).toBe(SITES.length - 1);
    expect(result.queued[REPORT]).toBe(SITES.length - 1);
    expect(await db.job.count({ where: { siteId: "site-00" } })).toBe(0);
  });

  it("schedules nothing on a pass whose filter fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    later(
      registerScheduleFilter(() => {
        throw new Error("lookup failed");
      })
    );
    const result = await runScheduler(db, { now: at(0), config });
    expect(result).toMatchObject({ ran: true, queued: {} });
    expect(await db.job.count()).toBe(0);
  });

  it("runs tasks once per pass, also with the scheduler off, and a failing one stops nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const task = vi.fn(async () => {});
    later(registerSchedulerTask("count", task));
    later(
      registerSchedulerTask("broken", async () => {
        throw new Error("boom");
      })
    );
    const first = await runScheduler(db, { now: at(0), config });
    expect(first.queued["gsc-sync"]).toBe(SITES.length);
    expect(task).toHaveBeenCalledTimes(1);
    // Not toHaveBeenCalledWith: deep-comparing the Prisma client recurses forever.
    const [taskDb, taskCtx] = task.mock.calls[0] as unknown as [PrismaClient, { now: Date }];
    expect(taskDb).toBe(db);
    expect(taskCtx).toEqual({ now: at(0) });

    // Another process within the same 10 minutes: no pass, no task.
    await runScheduler(db, { now: at(SCHEDULER_EVERY_MS / 2), config });
    expect(task).toHaveBeenCalledTimes(1);

    await runScheduler(db, { now: at(SCHEDULER_EVERY_MS), config: { ...config, enabled: false } });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("stops waiting for a task that hangs, after the jobs are queued", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let started = false;
    later(
      registerSchedulerTask("hangs", () => {
        started = true;
        return new Promise<void>(() => {});
      })
    );
    try {
      const pass = runScheduler(db, { now: at(0), config });
      await vi.waitFor(async () => expect(await db.job.count({ where: { type: "gsc-sync" } })).toBe(SITES.length));
      // The pass sets its timeout before it calls the task: advance only once that timer exists.
      await vi.waitFor(() => expect(started).toBe(true));
      await vi.advanceTimersByTimeAsync(SCHEDULER_TASK_TIMEOUT_MS);
      expect((await pass).queued["gsc-sync"]).toBe(SITES.length);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("scheduler task hangs still running"));
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Like simulate(), with Job.createdAt following the simulated clock (Prisma
 * fills it from the real clock otherwise).
 */
async function simulateWithClock(fromMs: number, toMs: number, type: string, stepMs = SCHEDULER_EVERY_MS) {
  const queuedAt = new Map<string, number>();
  for (let ms = fromMs; ms < toMs; ms += stepMs) {
    const now = at(ms);
    await runScheduler(db, { now, config, force: stepMs !== SCHEDULER_EVERY_MS });
    await db.job.updateMany({
      where: { status: "QUEUED" },
      data: { status: "SUCCEEDED", activeKey: null, finishedAt: now, createdAt: now },
    });
    const jobs = await db.job.findMany({ where: { type, createdAt: now }, select: { siteId: true } });
    for (const j of jobs) if (!queuedAt.has(j.siteId)) queuedAt.set(j.siteId, ms);
  }
  return queuedAt;
}


describe("intervals a user sets in Settings > Schedule", () => {
  /** A finished job of the type for every site, `ageMs` before T0: the interval rule measures from it. */
  async function lastJobs(type: string, ageMs: number) {
    for (const siteId of [...SITES, "other-site"]) {
      await db.job.create({
        data: { siteId, type, source: "schedule", status: "SUCCEEDED", maxAttempts: 2, createdAt: at(-ageMs), finishedAt: at(-ageMs) },
      });
    }
  }
  const queuedFor = async (type: string) =>
    (await db.job.findMany({ where: { type, status: "QUEUED" }, select: { siteId: true } })).map((j) => j.siteId).sort();

  beforeEach(async () => {
    await db.userSettings.deleteMany();
    // A site of another user, who keeps the server default.
    await db.site.create({ data: { id: "other-site", userId: "u2", domain: "other.example", createdAt: at(-90 * DAY) } });
  });

  it("crawls a user's sites as often as they set, others on the server default", async () => {
    await lastJobs("crawl", 2 * DAY);
    await db.userSettings.create({ data: { userId: "u1", crawlScheduleDays: 1 } });
    const { queued } = await runScheduler(db, { now: at(0), config });
    expect(queued.crawl).toBe(SITES.length);
    expect(await queuedFor("crawl")).toEqual(SITES);
  });

  it("queues nothing for a user who turned crawls off, while the default would", async () => {
    await lastJobs("crawl", 8 * DAY);
    await db.userSettings.create({ data: { userId: "u1", crawlScheduleDays: 0 } });
    await runScheduler(db, { now: at(0), config });
    expect(await queuedFor("crawl")).toEqual(["other-site"]);
  });

  it("waits the longer interval a user set before the next vitals check", async () => {
    await lastJobs("vitals", 8 * DAY);
    await db.userSettings.create({ data: { userId: "u1", vitalsScheduleDays: 14 } });
    await runScheduler(db, { now: at(0), config });
    expect(await queuedFor("vitals")).toEqual(["other-site"]);

    await db.job.updateMany({ where: { status: "QUEUED" }, data: { status: "SUCCEEDED", activeKey: null, createdAt: at(0) } });
    await runScheduler(db, { now: at(6 * DAY), config, force: true });
    expect(await queuedFor("vitals")).toEqual(SITES);
  });

  it("a type the server turned off stays off whatever a user set", async () => {
    await lastJobs("crawl", 8 * DAY);
    await db.userSettings.create({ data: { userId: "u1", crawlScheduleDays: 1 } });
    await runScheduler(db, { now: at(0), config: { ...config, crawlMs: 0 } });
    expect(await queuedFor("crawl")).toEqual([]);
    await runScheduler(db, { now: at(DAY), config: { ...config, enabled: false }, force: true });
    expect(await queuedFor("crawl")).toEqual([]);
  });

  it("null keeps the server default, and a user's crawl setting leaves their vitals checks alone", async () => {
    await lastJobs("crawl", 2 * DAY);
    await lastJobs("vitals", 2 * DAY);
    await db.userSettings.create({ data: { userId: "u1", crawlScheduleDays: null, vitalsScheduleDays: 1 } });
    await runScheduler(db, { now: at(0), config });
    expect(await queuedFor("crawl")).toEqual([]);
    expect(await queuedFor("vitals")).toEqual(SITES);
  });

  it("spreads a site's first scheduled crawl over the user's interval", async () => {
    await db.userSettings.create({ data: { userId: "u1", crawlScheduleDays: 1 } });
    await db.crawl.deleteMany();
    const queuedAt = await simulateWithClock(0, DAY, "crawl");
    expect([...queuedAt.keys()].sort()).toEqual(SITES);
    for (const [site, ms] of queuedAt) {
      expect(ms).toBeGreaterThanOrEqual(firstRunOffsetMs(site, "crawl", DAY));
    }
  }, 120_000);
});
