import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The job loop against the real Prisma client on PGlite: concurrency per
// class, follow-ups, recovery, and graceful stop.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { registerJobHandler } from "./handlers";
import { JobLoop } from "./loop";
import { enqueueJob } from "./queue";
import { JobRunner } from "./runner";
import type { JobContext } from "./types";

let t: TestDb;
let db: PrismaClient;

/** Handlers that wait until the test lets them finish. */
function gate() {
  const waiting: Array<{ ctx: JobContext; finish: () => void }> = [];
  const run = (ctx: JobContext) =>
    new Promise<undefined>((resolve, reject) => {
      waiting.push({ ctx, finish: () => resolve(undefined) });
      ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason));
    });
  return { waiting, run };
}

const long = gate();
const short = gate();
const stubborn = gate(); // ignores the stop
registerJobHandler({ type: "l-long", class: "LONG", maxAttempts: 2, isPermanent: () => true, stopOnShutdown: true, run: long.run });
registerJobHandler({ type: "l-short", class: "SHORT", maxAttempts: 2, isPermanent: () => false, run: short.run });
registerJobHandler({
  type: "l-stubborn",
  class: "SHORT",
  maxAttempts: 2,
  isPermanent: () => false,
  run: () => new Promise((resolve) => stubborn.waiting.push({ ctx: {} as JobContext, finish: () => resolve(undefined) })),
});
registerJobHandler({ type: "l-chain", class: "SHORT", maxAttempts: 1, isPermanent: () => false, followUps: () => ["l-done"], run: async () => undefined });
registerJobHandler({ type: "l-done", class: "SHORT", maxAttempts: 1, isPermanent: () => false, run: async () => ({ done: true }) });

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  for (const id of ["s1", "s2", "s3"]) await db.site.create({ data: { id, userId: "u1", domain: `${id}.example` } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  await db.workerHeartbeat.deleteMany();
  for (const g of [long, short, stubborn]) g.waiting.length = 0;
});

function loop(opts: Partial<{ longConcurrency: number; shortConcurrency: number }> = {}) {
  const runner = new JobRunner(db, { log: () => {} });
  return new JobLoop(db, runner, {
    mode: "worker",
    longConcurrency: opts.longConcurrency ?? 1,
    shortConcurrency: opts.shortConcurrency ?? 2,
    pollMs: 60_000,
    staleMs: 180_000,
    log: () => {},
  });
}

const statuses = async () =>
  Object.fromEntries((await db.job.findMany({ orderBy: { siteId: "asc" } })).map((j) => [`${j.type}:${j.siteId}`, j.status]));

describe("JobLoop", () => {
  it("runs at most the concurrency of each class at once", async () => {
    for (const s of ["s1", "s2"]) await enqueueJob(db, { type: "l-long", siteId: s, source: "manual" });
    for (const s of ["s1", "s2", "s3"]) await enqueueJob(db, { type: "l-short", siteId: s, source: "manual" });
    const l = loop({ longConcurrency: 1, shortConcurrency: 2 });

    expect(await l.tick()).toBe(3);
    expect(long.waiting).toHaveLength(1);
    expect(short.waiting).toHaveLength(2);
    expect(await l.tick()).toBe(0); // no free slot

    long.waiting[0].finish();
    await vi.waitFor(() => expect(long.waiting).toHaveLength(2));
    short.waiting[0].finish();
    await vi.waitFor(() => expect(short.waiting).toHaveLength(3));

    long.waiting[1].finish();
    short.waiting[1].finish();
    short.waiting[2].finish();
    await l.drain();
    expect(Object.values(await statuses())).toEqual(Array(5).fill("SUCCEEDED"));
  });

  it("drain runs the follow-ups a job queued", async () => {
    await enqueueJob(db, { type: "l-chain", siteId: "s1", source: "manual" });
    await loop().drain();
    expect(await statuses()).toEqual({ "l-chain:s1": "SUCCEEDED", "l-done:s1": "SUCCEEDED" });
    const done = await db.job.findFirstOrThrow({ where: { type: "l-done" } });
    expect(done).toMatchObject({ source: "chain", result: { done: true } });
  });

  it("stop puts a crawl-like job back at once and lets a short job finish within the grace period", async () => {
    await enqueueJob(db, { type: "l-long", siteId: "s1", source: "manual" });
    await enqueueJob(db, { type: "l-short", siteId: "s1", source: "manual" });
    const l = loop();
    await l.tick();
    await vi.waitFor(() => expect(long.waiting.length + short.waiting.length).toBe(2));

    const stopping = l.stop(5_000);
    // The long job is released right away; the short one is still running.
    await vi.waitFor(async () => expect((await statuses())["l-long:s1"]).toBe("QUEUED"));
    expect((await statuses())["l-short:s1"]).toBe("RUNNING");
    short.waiting[0].finish();
    await stopping;

    expect(await statuses()).toEqual({ "l-long:s1": "QUEUED", "l-short:s1": "SUCCEEDED" });
    expect((await db.job.findFirstOrThrow({ where: { type: "l-long" } })).attempts).toBe(0);
    // Nothing is claimed after stop.
    expect(await l.tick()).toBe(0);
  });

  it("stop puts back a job still running when the grace period ends", async () => {
    await enqueueJob(db, { type: "l-stubborn", siteId: "s1", source: "manual" });
    const l = loop();
    await l.tick();
    await vi.waitFor(() => expect(stubborn.waiting).toHaveLength(1));

    await l.stop(50);
    expect(await db.job.findFirstOrThrow({ where: { type: "l-stubborn" } })).toMatchObject({ status: "QUEUED", attempts: 0 });
    stubborn.waiting[0].finish();
  });

  it("keeps a heartbeat row while it runs and removes it on stop", async () => {
    const l = loop();
    l.start();
    await vi.waitFor(async () => expect(await db.workerHeartbeat.count({ where: { id: l.runner.workerId, mode: "worker" } })).toBe(1));
    await l.stop(100);
    expect(await db.workerHeartbeat.count()).toBe(0);
  });

  it("maintenance recovers dead jobs and drops heartbeat rows of long-gone processes", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 10 * 60_000);
    const { job } = await enqueueJob(db, { type: "l-short", siteId: "s1", source: "manual" });
    await db.job.update({ where: { id: job.id }, data: { status: "RUNNING", lockedBy: "gone", heartbeatAt: old, attempts: 1 } });
    await db.workerHeartbeat.create({
      data: { id: "gone", mode: "worker", hostname: "h", version: "0", startedAt: old, lastSeenAt: new Date(now.getTime() - 2 * 86_400_000) },
    });
    const onMaintenance = vi.fn(async () => {});
    const runner = new JobRunner(db, { log: () => {} });
    const l = new JobLoop(db, runner, { mode: "worker", longConcurrency: 1, shortConcurrency: 1, pollMs: 60_000, staleMs: 180_000, onMaintenance, log: () => {} });

    await l.maintenance(now);
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("QUEUED");
    expect(await db.workerHeartbeat.count()).toBe(0);
    expect(onMaintenance).toHaveBeenCalled();
    await l.stop(10);
  });
});
