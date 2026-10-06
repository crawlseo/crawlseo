import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Stale crawl recovery (#57) against the real Prisma client on PGlite. The
// crawl itself (network) is stubbed.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const runSiteCrawl = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("./engine", () => ({ runSiteCrawl }));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import {
  INTERRUPTED_MESSAGE,
  PROCESS_STARTED_AT,
  recoverCrawlsOnStartup,
  recoverStaleCrawls,
  startSiteCrawl,
} from "./lifecycle";
import { register } from "@/instrumentation";

const SEC = 1000;
const MIN = 60 * SEC;

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

const ago = (ms: number, from = Date.now()) => new Date(from - ms);

async function crawl(id: string, data: { status?: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"; startedAt?: Date | null; lastProgressAt?: Date | null }) {
  await db.crawl.create({ data: { id, siteId: "s1", status: "RUNNING", ...data } });
}

const statusOf = async (id: string) => (await db.crawl.findUniqueOrThrow({ where: { id } })).status;

describe("stale crawl rule", () => {
  it("marks a crawl failed once its progress is older than 5 minutes, not before", async () => {
    const now = new Date();
    // This process started an hour ago, so only the progress rule applies.
    const processStartedAt = ago(60 * MIN, now.getTime());
    await crawl("quiet-6m", { startedAt: ago(20 * MIN), lastProgressAt: ago(6 * MIN) });
    await crawl("quiet-4m", { startedAt: ago(20 * MIN), lastProgressAt: ago(4 * MIN) });
    await crawl("pending-6m", { status: "PENDING", startedAt: null, lastProgressAt: ago(6 * MIN) });
    await crawl("done", { status: "COMPLETED", startedAt: ago(9 * MIN), lastProgressAt: ago(8 * MIN) });

    expect(await recoverStaleCrawls(db, { now, processStartedAt })).toBe(2);

    const quiet = await db.crawl.findUniqueOrThrow({ where: { id: "quiet-6m" } });
    expect(quiet.status).toBe("FAILED");
    expect(quiet.error).toBe(INTERRUPTED_MESSAGE);
    expect(quiet.finishedAt).toEqual(now);
    expect(await statusOf("pending-6m")).toBe("FAILED");
    expect(await statusOf("quiet-4m")).toBe("RUNNING");
    expect(await statusOf("done")).toBe("COMPLETED");
  });

  it("a stale RUNNING crawl (old progress) is marked failed and a new crawl starts", async () => {
    await crawl("stale", { startedAt: ago(30 * MIN), lastProgressAt: ago(10 * MIN) });

    const result = await startSiteCrawl(db, { id: "s1", domain: "quilltab.app" }, 25);
    expect(result.started).toBe(true);
    expect(await statusOf("stale")).toBe("FAILED");
    if (!result.started) throw new Error("unreachable");
    expect(runSiteCrawl).toHaveBeenCalledWith("s1", "quilltab.app", 25, result.crawlId);
    const started = await db.crawl.findUniqueOrThrow({ where: { id: result.crawlId } });
    expect(started.status).toBe("PENDING");
    expect(started.lastProgressAt).not.toBeNull();
  });

  it("a RUNNING crawl with fresh progress still blocks a new one", async () => {
    await crawl("live", { startedAt: ago(10 * SEC), lastProgressAt: ago(5 * SEC) });

    expect(await startSiteCrawl(db, { id: "s1", domain: "quilltab.app" })).toEqual({
      started: false,
      runningCrawlId: "live",
    });
    expect(runSiteCrawl).not.toHaveBeenCalled();
    expect(await statusOf("live")).toBe("RUNNING");
  });
});

describe("on server start", () => {
  it("marks a RUNNING crawl that started before this process started as failed", async () => {
    // Two minutes quiet: not stale by the 5-minute rule on its own.
    await crawl("orphan", { startedAt: ago(2 * MIN), lastProgressAt: ago(2 * MIN) });
    expect(ago(2 * MIN) < PROCESS_STARTED_AT).toBe(true);

    // In a process that started before the crawl, it is left alone...
    await recoverStaleCrawls(db, { processStartedAt: ago(3 * MIN) });
    expect(await statusOf("orphan")).toBe("RUNNING");

    // ...but this process started after it, so its process is gone.
    await recoverCrawlsOnStartup(db, () => {});
    const orphan = await db.crawl.findUniqueOrThrow({ where: { id: "orphan" } });
    expect(orphan.status).toBe("FAILED");
    expect(orphan.error).toBe(INTERRUPTED_MESSAGE);
  });

  it("leaves a crawl that another live process runs (it keeps recording progress)", async () => {
    // e.g. the MCP server crawling while the web app restarts.
    await crawl("other-process", { startedAt: ago(10 * MIN), lastProgressAt: ago(5 * SEC) });
    await recoverCrawlsOnStartup(db, () => {});
    expect(await statusOf("other-process")).toBe("RUNNING");
  });

  it("the Next.js instrumentation hook runs the recovery", async () => {
    await crawl("orphan", { startedAt: ago(3 * 60 * MIN), lastProgressAt: null });
    const runtime = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = "nodejs";
    try {
      await register();
    } finally {
      process.env.NEXT_RUNTIME = runtime;
    }
    await vi.waitFor(async () => expect(await statusOf("orphan")).toBe("FAILED"));
  });
});
