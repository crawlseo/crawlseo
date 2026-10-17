import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The MCP run_crawl and get_crawl_status tools queue and report crawl jobs
// with the same rules as the web app, including the stale rule (#57). Real
// Prisma client on PGlite; the MCP server never runs the crawl itself.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const runSiteCrawl = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("@/lib/crawler/engine", () => ({ runSiteCrawl }));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { crawlStatus, runCrawl } from "./crawl";

const INTERRUPTED = "Interrupted: the server restarted or the crawl stopped responding";
const HOUR = 60 * 60_000;

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "quilltab.app" } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  await db.crawl.deleteMany();
  runSiteCrawl.mockClear();
  vi.unstubAllEnvs();
});

async function deadCrawlJob(attempts: number) {
  const startedAt = new Date(Date.now() - 3 * HOUR);
  await db.crawl.create({ data: { id: "stuck", siteId: "s1", status: "RUNNING", startedAt } });
  return db.job.create({
    data: {
      siteId: "s1",
      type: "crawl",
      source: "mcp",
      status: "RUNNING",
      attempts,
      maxAttempts: 2,
      activeKey: "crawl:s1",
      lockedBy: "gone:1:abc",
      lockedAt: startedAt,
      heartbeatAt: startedAt,
      crawlId: "stuck",
    },
  });
}

describe("MCP run_crawl", () => {
  it("queues a crawl job with the requested page limit and does not run it", async () => {
    const text = await runCrawl(db, { siteId: "s1", maxPages: 25 });
    expect(text).toMatch(/^Crawl queued\./);

    const job = await db.job.findFirstOrThrow({ where: { siteId: "s1", type: "crawl" } });
    expect(text).toContain(`Job ID: ${job.id}`);
    expect(text).toContain("Page limit: 25");
    expect(job).toMatchObject({ status: "QUEUED", source: "mcp", payload: { maxPages: 25 } });
    expect(runSiteCrawl).not.toHaveBeenCalled();
  });

  it("clamps the page limit to the server's ceiling", async () => {
    expect(await runCrawl(db, { siteId: "s1", maxPages: 999_999 })).toContain("Page limit: 2000");
    await db.job.deleteMany();
    vi.stubEnv("CRAWL_MAX_PAGES", "10");
    await runCrawl(db, { siteId: "s1", maxPages: 25 });
    const job = await db.job.findFirstOrThrow({ where: { siteId: "s1" } });
    expect(job.payload).toEqual({ maxPages: 10 });
  });

  it("refuses a second crawl while one is queued", async () => {
    await runCrawl(db, { siteId: "s1" });
    const text = await runCrawl(db, { siteId: "s1" });
    expect(text).toContain("A crawl is already queued for quilltab.app.");
    expect(await db.job.count()).toBe(1);
  });

  it("#57: a dead crawl job out of attempts fails and a new crawl is queued", async () => {
    const dead = await deadCrawlJob(2);
    expect(await runCrawl(db, { siteId: "s1" })).toMatch(/^Crawl queued\./);
    expect((await db.job.findUniqueOrThrow({ where: { id: dead.id } })).status).toBe("FAILED");
    const stuck = await db.crawl.findUniqueOrThrow({ where: { id: "stuck" } });
    expect(stuck.status).toBe("FAILED");
    expect(stuck.error).toBe(INTERRUPTED);
  });
});

describe("MCP get_crawl_status", () => {
  it("reports a queued job by its job id", async () => {
    await runCrawl(db, { siteId: "s1" });
    const job = await db.job.findFirstOrThrow({ where: { siteId: "s1" } });
    const text = await crawlStatus(db, job.id);
    expect(text).toContain("Job status: QUEUED");
    expect(text).toContain("Queued: waiting for the crawlseo app or its worker");
  });

  it("reports a dead job queued again, with its failed crawl attempt", async () => {
    const dead = await deadCrawlJob(1);
    const text = await crawlStatus(db, dead.id);
    expect(text).toContain("Job status: QUEUED");
    expect(text).toContain("Last error: Interrupted: the process running this job stopped responding");
    expect(text).toContain("Crawl: stuck");
    expect(text).toContain("Status: FAILED");
    expect(text).toContain(`Error: ${INTERRUPTED}`);
  });

  it("still reports a crawl from before the queue by its crawl id (#57)", async () => {
    await db.crawl.create({
      data: { id: "legacy", siteId: "s1", status: "RUNNING", startedAt: new Date(Date.now() - 3 * HOUR) },
    });
    const text = await crawlStatus(db, "legacy");
    expect(text).toContain("Status: FAILED");
    expect(text).toContain(`Error: ${INTERRUPTED}`);
  });
});
