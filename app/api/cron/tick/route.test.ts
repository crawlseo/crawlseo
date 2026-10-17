import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The cron route against the real Prisma client on PGlite. The sync handlers
// are replaced so no request leaves the test.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { getJobHandler, GSC_SYNC_JOB, registerJobHandler } from "@/lib/jobs/handlers";
import { GET } from "./route";

let t: TestDb;
let db: PrismaClient;
const gscRuns = vi.fn(async () => ({ keywordsInserted: 1, pagesInserted: 1 }));

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  registerJobHandler({ ...getJobHandler(GSC_SYNC_JOB)!, followUps: undefined, run: gscRuns });
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "a.example", gscProperty: "sc-domain:a.example" } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  await db.schedulerState.deleteMany();
  gscRuns.mockClear();
  vi.unstubAllEnvs();
});

const tick = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/tick", { headers: authorization ? { authorization } : {} }));

describe("GET /api/cron/tick", () => {
  it("refuses every request when CRON_SECRET is not set", async () => {
    expect((await tick("Bearer anything")).status).toBe(401);
    expect((await tick()).status).toBe(401);
  });

  it("refuses a wrong or missing secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-random-secret");
    expect((await tick()).status).toBe(401);
    expect((await tick("Bearer wrong")).status).toBe(401);
    expect((await tick("a-long-random-secret")).status).toBe(401);
    expect(await db.job.count()).toBe(0);
  });

  it("schedules and runs SHORT jobs, and never schedules or runs crawls", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-random-secret");
    // A crawl someone queued: the cron leaves it for a worker.
    await db.job.create({ data: { siteId: "s1", type: "crawl", source: "manual", maxAttempts: 2, activeKey: "crawl:s1" } });

    const res = await tick("Bearer a-long-random-secret");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ scheduled: { ran: true, queued: { "gsc-sync": 1 } }, processed: 1, remaining: 0 });
    expect(gscRuns).toHaveBeenCalledTimes(1);

    const jobs = await db.job.findMany({ orderBy: { type: "asc" } });
    expect(jobs.map((j) => [j.type, j.status])).toEqual([
      ["crawl", "QUEUED"],
      ["gsc-sync", "SUCCEEDED"],
    ]);
  });

  it("a second delivery right after the first schedules nothing again", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-random-secret");
    await tick("Bearer a-long-random-secret");
    const body = await (await tick("Bearer a-long-random-secret")).json();
    expect(body.scheduled.ran).toBe(false);
    expect(await db.job.count({ where: { type: "gsc-sync" } })).toBe(1);
  });
});
