import { mkdtempSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The worker process's start and stop against the real Prisma client on PGlite.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { registerJobHandler } from "@/lib/jobs/handlers";
import { enqueueJob } from "@/lib/jobs/queue";
import { crashHandlers, startWorker } from "./worker";

let t: TestDb;
let db: PrismaClient;
const healthFile = join(mkdtempSync(join(tmpdir(), "crawlseo-worker-")), "alive");

let release: (() => void) | null = null;
registerJobHandler({
  type: "w-crawl",
  class: "LONG",
  maxAttempts: 2,
  isPermanent: () => true,
  stopOnShutdown: true,
  run: (ctx) =>
    new Promise((_, reject) => {
      release = () => reject(new Error("never"));
      ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason));
    }),
});

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "a.example" } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  await db.workerHeartbeat.deleteMany();
  vi.unstubAllEnvs();
  vi.stubEnv("SCHEDULER_ENABLED", "false");
});

const quiet = () => {};

describe("startWorker", () => {
  it("refuses to start with WORKER_MODE=off", async () => {
    vi.stubEnv("WORKER_MODE", "off");
    await expect(startWorker(db, { healthFile, log: quiet })).rejects.toThrow("WORKER_MODE=off");
  });

  it("registers, touches the health file, runs jobs, and on shutdown puts a running crawl back", async () => {
    vi.stubEnv("WORKER_MODE", "worker");
    const { job } = await enqueueJob(db, { type: "w-crawl", siteId: "s1", source: "manual" });
    const worker = await startWorker(db, { healthFile, log: quiet });

    expect(Date.now() - statSync(healthFile).mtimeMs).toBeLessThan(5_000);
    // The loop's timers do not keep a process alive; the worker's own does.
    expect(process.getActiveResourcesInfo()).toContain("Timeout");
    await vi.waitFor(async () => expect(await db.workerHeartbeat.count({ where: { mode: "worker" } })).toBe(1));
    await vi.waitFor(async () => expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("RUNNING"));

    await worker.shutdown("SIGTERM");
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "QUEUED", attempts: 0 });
    expect(await db.workerHeartbeat.count()).toBe(0);
    // A second signal does not run the stop twice.
    await worker.shutdown("SIGTERM");
    release?.();
  });

  it("an uncaught exception puts the held jobs back and exits non-zero", async () => {
    vi.stubEnv("WORKER_MODE", "worker");
    const { job } = await enqueueJob(db, { type: "w-crawl", siteId: "s1", source: "manual" });
    const worker = await startWorker(db, { healthFile, log: quiet });
    // Held by this process's runner, not only claimed in the database.
    await vi.waitFor(() => expect(worker.loop.runner.count()).toBe(1));

    const exit = vi.fn();
    const logs: string[] = [];
    const crash = crashHandlers(() => worker, { exit, log: (m) => logs.push(m) });
    await crash.uncaughtException(new Error("boom"));

    expect(exit).toHaveBeenCalledWith(1);
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "QUEUED", attempts: 0 });
    expect(logs.some((l) => l.includes("uncaught exception") && l.includes("boom"))).toBe(true);
    await worker.shutdown("test");
    release?.();
  });

  it("an unhandled rejection is logged and does not exit", async () => {
    const exit = vi.fn();
    const logs: string[] = [];
    const crash = crashHandlers(() => undefined, { exit, log: (m) => logs.push(m) });
    crash.unhandledRejection(new Error("lost promise"));
    expect(logs[0]).toContain("unhandled rejection");
    expect(logs[0]).toContain("lost promise");
    expect(exit).not.toHaveBeenCalled();
  });

  it("an uncaught exception before the worker started still exits non-zero", async () => {
    const exit = vi.fn();
    await crashHandlers(() => undefined, { exit, log: quiet }).uncaughtException(new Error("early"));
    expect(exit).toHaveBeenCalledWith(1);
  });
});

