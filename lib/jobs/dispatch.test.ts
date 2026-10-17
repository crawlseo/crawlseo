import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// What a request does after it queued a job, per WORKER_MODE and host.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const after = vi.hoisted(() => vi.fn());
const wake = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("next/server", () => ({ after }));
vi.mock("./inline", () => ({ inlineJobLoop: () => ({ wake }) }));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { dispatchJob, runJobNow } from "./dispatch";
import { registerJobHandler } from "./handlers";
import { enqueueJob } from "./queue";

let t: TestDb;
let db: PrismaClient;

const ran = vi.fn(async () => ({ ok: true }));
registerJobHandler({ type: "d-test", class: "SHORT", maxAttempts: 1, isPermanent: () => false, followUps: () => ["d-next"], run: ran });
registerJobHandler({ type: "d-next", class: "SHORT", maxAttempts: 1, isPermanent: () => false, run: async () => ({ next: true }) });
const flaky = vi.fn<() => Promise<unknown>>();
registerJobHandler({ type: "d-flaky", class: "SHORT", maxAttempts: 3, isPermanent: () => false, run: () => flaky() as never });
const flakyLong = vi.fn<() => Promise<unknown>>();
registerJobHandler({ type: "d-flaky-long", class: "LONG", maxAttempts: 2, isPermanent: () => false, run: () => flakyLong() as never });

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "s1.example" } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const queued = { id: "j1", status: "QUEUED" as const };

describe("dispatchJob", () => {
  it("inline on a long-running server wakes the loop", () => {
    dispatchJob(db, queued);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
  });

  it("inline on a serverless host runs the job after the response", () => {
    vi.stubEnv("VERCEL", "1");
    dispatchJob(db, queued);
    expect(after).toHaveBeenCalledTimes(1);
    expect(wake).not.toHaveBeenCalled();
  });

  it("off and worker only queue", () => {
    for (const mode of ["off", "worker"]) {
      vi.stubEnv("WORKER_MODE", mode);
      dispatchJob(db, queued);
    }
    vi.stubEnv("VERCEL", "1");
    dispatchJob(db, queued);
    expect(wake).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("does nothing for a job that is already running", () => {
    vi.stubEnv("VERCEL", "1");
    dispatchJob(db, { id: "j1", status: "RUNNING" });
    expect(after).not.toHaveBeenCalled();
  });
});

describe("runJobNow", () => {
  it("runs the job and its follow-ups while time is left", async () => {
    const { job } = await enqueueJob(db, { type: "d-test", siteId: "s1", source: "manual" });
    await runJobNow(db, job.id, { deadline: Date.now() + 270_000 });
    const rows = await db.job.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.type, r.status])).toEqual([
      ["d-test", "SUCCEEDED"],
      ["d-next", "SUCCEEDED"],
    ]);
  });

  it("leaves follow-ups queued when the deadline is close", async () => {
    const { job } = await enqueueJob(db, { type: "d-test", siteId: "s1", source: "manual" });
    await runJobNow(db, job.id, { deadline: Date.now() + 30_000 });
    const next = await db.job.findFirstOrThrow({ where: { type: "d-next" } });
    expect(next.status).toBe("QUEUED");
  });

  it("does nothing for a job another process already claimed", async () => {
    const { job } = await enqueueJob(db, { type: "d-test", siteId: "s1", source: "manual" });
    await db.job.update({ where: { id: job.id }, data: { status: "RUNNING", lockedBy: "other" } });
    await runJobNow(db, job.id, { deadline: Date.now() + 270_000 });
    expect(ran).not.toHaveBeenCalled();
  });

  it("retries a SHORT job inside the request while the budget allows", async () => {
    flaky.mockRejectedValueOnce(new Error("socket hang up")).mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce({ ok: 1 });
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const { job } = await enqueueJob(db, { type: "d-flaky", siteId: "s1", source: "manual" });

    await runJobNow(db, job.id, { deadline: Date.now() + 270_000, sleep });
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "SUCCEEDED", attempts: 3 });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2_000, 10_000]);
  });

  it("leaves a SHORT job queued for its next attempt when the budget is spent", async () => {
    flaky.mockRejectedValue(new Error("socket hang up"));
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const { job } = await enqueueJob(db, { type: "d-flaky", siteId: "s1", source: "manual" });

    await runJobNow(db, job.id, { deadline: Date.now() + 61_000, sleep });
    const row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "QUEUED", attempts: 1, lastError: "socket hang up" });
    expect(row.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(sleep).not.toHaveBeenCalled();
    flaky.mockReset();
  });

  it("on a serverless host a LONG job that fails is not left queued: it fails", async () => {
    vi.stubEnv("VERCEL", "1");
    flakyLong.mockRejectedValueOnce(new Error("timeout"));
    const { job } = await enqueueJob(db, { type: "d-flaky-long", siteId: "s1", source: "manual" });
    await runJobNow(db, job.id, { deadline: Date.now() + 270_000, sleep: async () => {} });
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "FAILED",
      attempts: 1,
      activeKey: null,
      lastError: "timeout",
    });
  });
});

