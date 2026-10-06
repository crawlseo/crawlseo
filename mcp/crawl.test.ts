import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The MCP run_crawl and get_crawl_status tools follow the same stale crawl rule
// as the web app (#57). Real Prisma client on PGlite; the crawl itself is stubbed.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const runSiteCrawl = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("../lib/crawler/engine", () => ({ runSiteCrawl }));

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
  await db.crawl.deleteMany();
  runSiteCrawl.mockClear();
});

describe("MCP run_crawl (#57)", () => {
  it("marks a stuck crawl failed and starts a new one with the requested page limit", async () => {
    await db.crawl.create({
      data: { id: "stuck", siteId: "s1", status: "RUNNING", startedAt: new Date(Date.now() - 3 * HOUR) },
    });

    const text = await runCrawl(db, { siteId: "s1", maxPages: 25 });
    expect(text).toMatch(/^Crawl started\./);

    const stuck = await db.crawl.findUniqueOrThrow({ where: { id: "stuck" } });
    expect(stuck.status).toBe("FAILED");
    expect(stuck.error).toBe(INTERRUPTED);

    const started = await db.crawl.findFirstOrThrow({ where: { siteId: "s1", status: "PENDING" } });
    expect(text).toContain(`Crawl ID: ${started.id}`);
    expect(started.maxPages).toBe(25);
    expect(runSiteCrawl).toHaveBeenCalledWith("s1", "quilltab.app", 25, started.id);
  });

  it("refuses while a crawl with fresh progress is running", async () => {
    await db.crawl.create({
      data: { id: "live", siteId: "s1", status: "RUNNING", startedAt: new Date(), lastProgressAt: new Date() },
    });

    const text = await runCrawl(db, { siteId: "s1" });
    expect(text).toContain("A crawl is already running for quilltab.app.");
    expect(text).toContain("Crawl ID: live");
    expect(runSiteCrawl).not.toHaveBeenCalled();
    expect(await db.crawl.count()).toBe(1);
  });

  it("get_crawl_status reports a stuck crawl as FAILED with the message", async () => {
    await db.crawl.create({
      data: { id: "stuck", siteId: "s1", status: "RUNNING", startedAt: new Date(Date.now() - 3 * HOUR) },
    });

    const text = await crawlStatus(db, "stuck");
    expect(text).toContain("Status: FAILED");
    expect(text).toContain(`Error: ${INTERRUPTED}`);
  });
});
