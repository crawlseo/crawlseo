import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { jobTypes } from "./handlers";
import { firstRunOffsetMs, runScheduler, SCHEDULER_EVERY_MS, slackMs } from "./scheduler";
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

