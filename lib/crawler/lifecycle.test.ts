import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Stale crawl recovery (#57) for crawls without a job, against the real
// Prisma client on PGlite. Crawls that belong to a job are recovered through
// the job (lib/jobs/queue.test.ts).

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));

vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import {
  INTERRUPTED_MESSAGE,
  PROCESS_STARTED_AT,
  recoverCrawlsOnStartup,
  recoverStaleCrawls,
  stopCrawls,
  trackRunningCrawl,
} from "./lifecycle";
import { register } from "@/instrumentation";
import { inlineJobLoop } from "@/lib/jobs/inline";

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
  await db.job.deleteMany();
  await db.crawl.deleteMany();
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

  it("never touches a crawl that belongs to a job, however quiet", async () => {
    await crawl("job-crawl", { startedAt: ago(30 * MIN), lastProgressAt: ago(10 * MIN) });
    await db.job.create({
      data: { siteId: "s1", type: "crawl", source: "manual", maxAttempts: 2, status: "RUNNING", crawlId: "job-crawl" },
    });
    await crawl("legacy", { startedAt: ago(30 * MIN), lastProgressAt: ago(10 * MIN) });

    expect(await recoverStaleCrawls(db)).toBe(1);
    expect(await statusOf("job-crawl")).toBe("RUNNING");
    expect(await statusOf("legacy")).toBe("FAILED");
  });
});

describe("stopCrawls", () => {
  it("aborts a crawl this process runs, once", async () => {
    const controller = new AbortController();
    const untrack = trackRunningCrawl("c1", controller);

    expect(stopCrawls(["c1", "not-running"], "Stopped: test")).toBe(1);
    expect(controller.signal.aborted).toBe(true);
    expect((controller.signal.reason as Error).message).toBe("Stopped: test");
    expect(stopCrawls(["c1"])).toBe(0);
    untrack();
  });

  it("untracking a finished crawl leaves a newer controller for the same id alone", () => {
    const first = new AbortController();
    const untrackFirst = trackRunningCrawl("c2", first);
    const second = new AbortController();
    trackRunningCrawl("c2", second);
    untrackFirst();
    expect(stopCrawls(["c2"])).toBe(1);
    expect(second.signal.aborted).toBe(true);
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
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("WORKER_MODE", "off");
    try {
      await register();
    } finally {
      vi.unstubAllEnvs();
    }
    await vi.waitFor(async () => expect(await statusOf("orphan")).toBe("FAILED"));
    // WORKER_MODE=off: the app only queues jobs.
    expect(inlineJobLoop()).toBeUndefined();
  });

  it("the instrumentation hook starts the inline job loop by default", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("WORKER_MODE", "");
    vi.stubEnv("VERCEL", "");
    try {
      await register();
      const loop = inlineJobLoop();
      expect(loop).toBeDefined();
      await vi.waitFor(async () => expect(await db.workerHeartbeat.count({ where: { mode: "inline" } })).toBe(1));
      await loop!.stop(1000);
      expect(await db.workerHeartbeat.count()).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
