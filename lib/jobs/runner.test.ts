import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// JobRunner against the real Prisma client on PGlite, with handlers
// registered by the test: what each outcome writes, and how heartbeats and
// shutdown stop a job.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { registerJobHandler } from "./handlers";
import { claimJobs, enqueueJob } from "./queue";
import { JobRunner } from "./runner";
import { isPermanentJobError, JobError, RELEASED_MESSAGE, type JobContext } from "./types";

let t: TestDb;
let db: PrismaClient;

const run = vi.fn<(ctx: JobContext) => Promise<unknown>>();
registerJobHandler({
  type: "r-test",
  class: "SHORT",
  maxAttempts: 2,
  isPermanent: isPermanentJobError,
  run: (ctx) => run(ctx) as never,
  followUps: () => ["r-follow"],
});
registerJobHandler({ type: "r-follow", class: "SHORT", maxAttempts: 1, isPermanent: () => false, run: async () => ({ followed: true }) });

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
  run.mockReset();
});

async function claimOne(runner: JobRunner, type = "r-test") {
  await enqueueJob(db, { type, siteId: "s1", source: "manual" });
  const [job] = await claimJobs(db, { workerId: runner.workerId, types: [type], limit: 1 });
  return job;
}

const row = (id: string) => db.job.findUniqueOrThrow({ where: { id } });

describe("JobRunner.execute", () => {
  it("records the result and queues the follow-ups", async () => {
    const runner = new JobRunner(db, { log: () => {} });
    run.mockResolvedValueOnce({ synced: 3 });
    const job = await claimOne(runner);

    const { outcome, followUps } = await runner.execute(job);
    expect(outcome).toBe("succeeded");
    expect(await row(job.id)).toMatchObject({ status: "SUCCEEDED", result: { synced: 3 }, activeKey: null });
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({ type: "r-follow", siteId: "s1", source: "chain", status: "QUEUED" });
    expect(run.mock.calls[0][0]).toMatchObject({ job: { id: job.id }, workerId: runner.workerId });
  });

  it("retries a failure while attempts are left, then fails it", async () => {
    const runner = new JobRunner(db, { log: () => {} });
    run.mockRejectedValue(new Error("socket hang up"));
    const job = await claimOne(runner);

    expect((await runner.execute(job)).outcome).toBe("retry");
    const retried = await row(job.id);
    expect(retried).toMatchObject({ status: "QUEUED", attempts: 1, lastError: "socket hang up" });
    expect(retried.runAt.getTime()).toBeGreaterThan(Date.now() + 30_000);

    await db.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    const [second] = await claimJobs(db, { workerId: runner.workerId, types: ["r-test"], limit: 1 });
    expect((await runner.execute(second)).outcome).toBe("failed");
    expect(await row(job.id)).toMatchObject({ status: "FAILED", attempts: 2, activeKey: null, lastError: "socket hang up" });
  });

  it("fails a permanent error at once, with its code", async () => {
    const runner = new JobRunner(db, { log: () => {} });
    run.mockRejectedValueOnce(new JobError("Google access expired", { code: "REAUTH_REQUIRED", permanent: true }));
    const job = await claimOne(runner);

    expect((await runner.execute(job)).outcome).toBe("failed");
    expect(await row(job.id)).toMatchObject({ status: "FAILED", attempts: 1, errorCode: "REAUTH_REQUIRED" });
  });

  it("fails a job of a type nobody registered", async () => {
    const runner = new JobRunner(db, { log: () => {} });
    const job = await claimOne(runner);
    await db.job.update({ where: { id: job.id }, data: { type: "gone-type" } });

    expect((await runner.execute({ ...job, type: "gone-type" })).outcome).toBe("failed");
    expect(await row(job.id)).toMatchObject({ status: "FAILED", errorCode: "UNKNOWN_TYPE" });
  });

  it("a heartbeat that finds the job taken over stops it and discards its result", async () => {
    const runner = new JobRunner(db, { log: () => {} });
    let signal: AbortSignal | undefined;
    run.mockImplementationOnce(async (ctx) => {
      signal = ctx.signal;
      await new Promise((_, reject) => ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason)));
    });
    const job = await claimOne(runner);

    const running = runner.execute(job);
    await vi.waitFor(() => expect(signal).toBeDefined());
    await db.job.update({ where: { id: job.id }, data: { lockedBy: "other:2:bbb" } });
    await runner.heartbeat();

    expect((await running).outcome).toBe("lost");
    expect(signal!.aborted).toBe(true);
    expect(await row(job.id)).toMatchObject({ status: "RUNNING", lockedBy: "other:2:bbb" });
  });

  it("release stops the job and puts it back without counting the attempt", async () => {
    const runner = new JobRunner(db, { log: () => {} });
    let reason: unknown;
    run.mockImplementationOnce(async (ctx) => {
      await new Promise((_, reject) =>
        ctx.signal.addEventListener("abort", () => {
          reason = ctx.signal.reason;
          reject(ctx.signal.reason);
        })
      );
    });
    const job = await claimOne(runner);

    const running = runner.execute(job);
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    expect(runner.count()).toBe(1);
    runner.release();

    expect((await running).outcome).toBe("released");
    expect((reason as Error).message).toBe(RELEASED_MESSAGE);
    expect(await row(job.id)).toMatchObject({ status: "QUEUED", attempts: 0, lockedBy: null });
    expect(runner.count()).toBe(0);
  });

  it("forceReleaseAll puts back a job whose handler ignores the stop", async () => {
    const runner = new JobRunner(db, { log: () => {} });
    let finish!: (v: unknown) => void;
    run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const job = await claimOne(runner);

    const running = runner.execute(job);
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    expect(await runner.forceReleaseAll()).toBe(1);
    expect(await row(job.id)).toMatchObject({ status: "QUEUED", attempts: 0 });

    // The handler finishing later changes nothing.
    finish({ late: true });
    expect((await running).outcome).toBe("lost");
    expect(await row(job.id)).toMatchObject({ status: "QUEUED", result: null });
  });
});
