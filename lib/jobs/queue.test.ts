import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The queue's state changes against the real Prisma client on PGlite:
// dedupe, claim order and filters, retry backoff, fencing and recovery.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { registerJobHandler } from "./handlers";
import {
  backoffMs,
  claimJobById,
  claimJobs,
  enqueueJob,
  heartbeatJobs,
  markFailed,
  markRetry,
  markSucceeded,
  recoverStaleJobs,
  releaseJob,
} from "./queue";
import { INTERRUPTED_JOB_MESSAGE, isPermanentJobError } from "./types";

const MIN = 60_000;
const W = "worker-a:1:aaa";

let t: TestDb;
let db: PrismaClient;

registerJobHandler({ type: "q-short", class: "SHORT", maxAttempts: 3, isPermanent: isPermanentJobError, run: async () => undefined });
registerJobHandler({ type: "q-long", class: "LONG", maxAttempts: 2, isPermanent: isPermanentJobError, run: async () => undefined });

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  for (const id of ["s1", "s2", "s3"]) {
    await db.site.create({ data: { id, userId: "u1", domain: `${id}.example` } });
  }
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  await db.crawl.deleteMany();
});

const at = (ms: number) => new Date(Date.UTC(2026, 9, 17, 12, 0, 0) + ms);

describe("enqueueJob", () => {
  it("queues one active job per type and site", async () => {
    const a = await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual" });
    expect(a.created).toBe(true);
    expect(a.job).toMatchObject({ status: "QUEUED", maxAttempts: 3, activeKey: "q-short:s1", attempts: 0 });

    const again = await enqueueJob(db, { type: "q-short", siteId: "s1", source: "schedule" });
    expect(again).toEqual({ job: a.job, created: false });

    // Another type, or another site, is a separate job.
    expect((await enqueueJob(db, { type: "q-long", siteId: "s1", source: "manual" })).created).toBe(true);
    expect((await enqueueJob(db, { type: "q-short", siteId: "s2", source: "manual" })).created).toBe(true);
    expect(await db.job.count()).toBe(3);
  });

  it("a running job still blocks a duplicate; a finished one does not", async () => {
    const { job } = await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual" });
    const [claimed] = await claimJobs(db, { workerId: W, types: ["q-short"], limit: 1 });
    expect((await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual" })).created).toBe(false);

    expect(await markSucceeded(db, claimed, W, { ok: true })).toBe(true);
    const done = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({ status: "SUCCEEDED", activeKey: null, result: { ok: true } });
    expect((await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual" })).created).toBe(true);
  });

  it("a failed job no longer blocks either", async () => {
    await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual" });
    const [claimed] = await claimJobs(db, { workerId: W, types: ["q-short"], limit: 1 });
    await markFailed(db, claimed, W, { message: "nope", code: "X" });
    expect((await db.job.findUniqueOrThrow({ where: { id: claimed.id } })).activeKey).toBeNull();
    expect((await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual" })).created).toBe(true);
  });

  it("refuses a type nobody registered", async () => {
    await expect(enqueueJob(db, { type: "nope", siteId: "s1", source: "manual" })).rejects.toThrow("Unknown job type: nope");
  });
});

describe("claimJobs", () => {
  it("claims due jobs of the given types, highest priority first, up to the limit", async () => {
    const now = at(0);
    const low = await enqueueJob(db, { type: "q-short", siteId: "s1", source: "schedule", runAt: at(-2 * MIN) });
    const high = await enqueueJob(db, { type: "q-short", siteId: "s2", source: "manual", priority: 10, runAt: at(-1 * MIN) });
    await enqueueJob(db, { type: "q-short", siteId: "s3", source: "schedule", runAt: at(5 * MIN) }); // not due
    await enqueueJob(db, { type: "q-long", siteId: "s1", source: "manual", runAt: at(-5 * MIN) }); // other class

    const claimed = await claimJobs(db, { workerId: W, types: ["q-short"], limit: 5, now });
    expect(claimed.map((j) => j.id)).toEqual([high.job.id, low.job.id]);
    for (const job of claimed) {
      expect(job).toMatchObject({ status: "RUNNING", lockedBy: W, attempts: 1, lockedAt: now, heartbeatAt: now, startedAt: now });
    }

    // Already claimed: nothing more of this type is due.
    expect(await claimJobs(db, { workerId: "other", types: ["q-short"], limit: 5, now })).toEqual([]);
    expect(await claimJobs(db, { workerId: W, types: ["q-long"], limit: 0, now })).toEqual([]);
    expect(await claimJobs(db, { workerId: W, types: [], limit: 5, now })).toEqual([]);
  });

  it("respects the limit", async () => {
    for (const s of ["s1", "s2", "s3"]) await enqueueJob(db, { type: "q-short", siteId: s, source: "manual" });
    expect(await claimJobs(db, { workerId: W, types: ["q-short"], limit: 2 })).toHaveLength(2);
    expect(await claimJobs(db, { workerId: W, types: ["q-short"], limit: 2 })).toHaveLength(1);
  });

  it("claimJobById claims only a queued, due job", async () => {
    const { job } = await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual" });
    const later = await enqueueJob(db, { type: "q-short", siteId: "s2", source: "manual", runAt: at(60 * MIN) });

    expect(await claimJobById(db, { workerId: W, jobId: later.job.id, now: at(0) })).toBeNull();
    const claimed = await claimJobById(db, { workerId: W, jobId: job.id });
    expect(claimed).toMatchObject({ id: job.id, status: "RUNNING", lockedBy: W });
    expect(await claimJobById(db, { workerId: "other", jobId: job.id })).toBeNull();
  });
});

describe("retry and backoff", () => {
  it("backs off 1, 5, 25 minutes, at most an hour, with ±20% jitter", () => {
    expect(backoffMs(1, () => 0.5)).toBe(MIN);
    expect(backoffMs(2, () => 0.5)).toBe(5 * MIN);
    expect(backoffMs(3, () => 0.5)).toBe(25 * MIN);
    expect(backoffMs(4, () => 0.5)).toBe(60 * MIN);
    expect(backoffMs(9, () => 0.5)).toBe(60 * MIN);
    expect(backoffMs(1, () => 0)).toBe(0.8 * MIN);
    expect(backoffMs(1, () => 1)).toBe(1.2 * MIN);
  });

  it("a retry goes back to the queue after the backoff and keeps its active key", async () => {
    const { job } = await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual", runAt: at(-MIN) });
    const [claimed] = await claimJobs(db, { workerId: W, types: ["q-short"], limit: 1, now: at(0) });

    expect(await markRetry(db, claimed, W, { message: "timeout", code: "T" }, at(0), 5 * MIN)).toBe(true);
    const row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({
      status: "QUEUED",
      runAt: at(5 * MIN),
      attempts: 1,
      lockedBy: null,
      lastError: "timeout",
      errorCode: "T",
      activeKey: "q-short:s1",
    });

    expect(await claimJobs(db, { workerId: W, types: ["q-short"], limit: 1, now: at(4 * MIN) })).toEqual([]);
    const [second] = await claimJobs(db, { workerId: W, types: ["q-short"], limit: 1, now: at(5 * MIN) });
    expect(second.attempts).toBe(2);
  });

  it("release puts the job back now without counting the attempt", async () => {
    await enqueueJob(db, { type: "q-long", siteId: "s1", source: "manual" });
    const [claimed] = await claimJobs(db, { workerId: W, types: ["q-long"], limit: 1 });
    expect(await releaseJob(db, claimed, W, at(0))).toBe(true);
    const row = await db.job.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(row).toMatchObject({ status: "QUEUED", attempts: 0, runAt: at(0), lockedBy: null });
  });
});

describe("fencing", () => {
  it("writes from a process that no longer holds the job change nothing", async () => {
    await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual" });
    const [claimed] = await claimJobs(db, { workerId: W, types: ["q-short"], limit: 1 });
    // Another process took it over.
    await db.job.update({ where: { id: claimed.id }, data: { lockedBy: "worker-b:2:bbb" } });

    expect(await markSucceeded(db, claimed, W, { ok: true })).toBe(false);
    expect(await markRetry(db, claimed, W, { message: "x" })).toBe(false);
    expect(await markFailed(db, claimed, W, { message: "x" })).toBe(false);
    expect(await releaseJob(db, claimed, W)).toBe(false);
    expect(await heartbeatJobs(db, { workerId: W, jobIds: [claimed.id] })).toEqual(new Set());
    expect(await db.job.findUniqueOrThrow({ where: { id: claimed.id } })).toMatchObject({
      status: "RUNNING",
      lockedBy: "worker-b:2:bbb",
      result: null,
    });
  });

  it("heartbeats report the jobs this process still holds", async () => {
    await enqueueJob(db, { type: "q-short", siteId: "s1", source: "manual", runAt: at(-MIN) });
    await enqueueJob(db, { type: "q-short", siteId: "s2", source: "manual", runAt: at(-MIN) });
    const claimed = await claimJobs(db, { workerId: W, types: ["q-short"], limit: 2, now: at(0) });
    await db.job.delete({ where: { id: claimed[1].id } }); // e.g. the site was deleted

    const held = await heartbeatJobs(db, { workerId: W, jobIds: claimed.map((j) => j.id), now: at(MIN) });
    expect(held).toEqual(new Set([claimed[0].id]));
    expect((await db.job.findUniqueOrThrow({ where: { id: claimed[0].id } })).heartbeatAt).toEqual(at(MIN));
  });
});

describe("recoverStaleJobs", () => {
  async function running(siteId: string, type: string, heartbeatAt: Date, attempts: number, crawlId?: string) {
    const { job } = await enqueueJob(db, { type, siteId, source: "manual" });
    return db.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", lockedBy: "gone:1:xyz", lockedAt: heartbeatAt, heartbeatAt, attempts, crawlId },
    });
  }

  it("queues a dead job again with backoff, or fails it when out of attempts", async () => {
    const now = at(0);
    const retry = await running("s1", "q-short", at(-10 * MIN), 1);
    const out = await running("s2", "q-short", at(-10 * MIN), 3);
    const fresh = await running("s3", "q-short", at(-1 * MIN), 1);

    expect(await recoverStaleJobs(db, { now, staleMs: 3 * MIN, random: () => 0.5 })).toEqual({ requeued: 1, failed: 1 });

    expect(await db.job.findUniqueOrThrow({ where: { id: retry.id } })).toMatchObject({
      status: "QUEUED",
      runAt: at(MIN),
      lockedBy: null,
      lastError: INTERRUPTED_JOB_MESSAGE,
      errorCode: "INTERRUPTED",
      activeKey: "q-short:s1",
    });
    expect(await db.job.findUniqueOrThrow({ where: { id: out.id } })).toMatchObject({
      status: "FAILED",
      finishedAt: now,
      activeKey: null,
      errorCode: "INTERRUPTED",
    });
    expect((await db.job.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("RUNNING");
  });

  it("marks the crawl row of a dead crawl job failed", async () => {
    await db.crawl.create({ data: { id: "c1", siteId: "s1", status: "RUNNING", startedAt: at(-20 * MIN) } });
    await db.crawl.create({ data: { id: "c-done", siteId: "s2", status: "COMPLETED", startedAt: at(-20 * MIN) } });
    await running("s1", "crawl", at(-10 * MIN), 1, "c1");
    await running("s2", "crawl", at(-10 * MIN), 2, "c-done");

    await recoverStaleJobs(db, { now: at(0), staleMs: 3 * MIN });
    expect(await db.crawl.findUniqueOrThrow({ where: { id: "c1" } })).toMatchObject({
      status: "FAILED",
      error: "Interrupted: the server restarted or the crawl stopped responding",
    });
    // A finished crawl row keeps its result.
    expect((await db.crawl.findUniqueOrThrow({ where: { id: "c-done" } })).status).toBe("COMPLETED");
  });

  it("can be scoped to one site", async () => {
    await running("s1", "q-short", at(-10 * MIN), 1);
    const other = await running("s2", "q-short", at(-10 * MIN), 1);
    expect(await recoverStaleJobs(db, { now: at(0), staleMs: 3 * MIN, siteId: "s1" })).toEqual({ requeued: 1, failed: 0 });
    expect((await db.job.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("RUNNING");
  });

  it("leaves a job whose process sent a heartbeat in between", async () => {
    const job = await running("s1", "q-short", at(-10 * MIN), 1);
    const findMany = db.job.findMany.bind(db.job);
    // The heartbeat lands between the read and the update.
    const spy = vi.spyOn(db.job, "findMany").mockImplementationOnce((async (args: unknown) => {
      const rows = await findMany(args as never);
      await db.job.update({ where: { id: job.id }, data: { heartbeatAt: at(0) } });
      return rows;
    }) as never);
    expect(await recoverStaleJobs(db, { now: at(0), staleMs: 3 * MIN })).toEqual({ requeued: 0, failed: 0 });
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("RUNNING");
    spy.mockRestore();
  });
});
