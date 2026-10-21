import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// requestSiteJob against the real Prisma client on PGlite.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { GSC_SYNC_JOB } from "./handlers";
import { enqueueJob } from "./queue";
import { requestSiteJob } from "./site-jobs";

let t: TestDb;
let db: PrismaClient;

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
});

async function inBackoff() {
  const { job } = await enqueueJob(db, { type: GSC_SYNC_JOB, siteId: "s1", source: "schedule" });
  return db.job.update({
    where: { id: job.id },
    data: { runAt: new Date(Date.now() + 25 * 60_000), attempts: 1, lastError: "timeout" },
  });
}

describe("requestSiteJob", () => {
  it("a manual PageSpeed request updates the limit of a queued scheduled job", async () => {
    const waiting = await enqueueJob(db, { type: "vitals", siteId: "s1", source: "schedule" });
    const { job, created } = await requestSiteJob(db, {
      type: "vitals", siteId: "s1", source: "manual", payload: { limit: 3 },
    });
    expect(created).toBe(false);
    expect(job).toMatchObject({ id: waiting.job.id, payload: { limit: 3 }, priority: 10 });
  });

  it("never changes the PageSpeed limit of an already running job", async () => {
    const { job } = await enqueueJob(db, { type: "vitals", siteId: "s1", source: "schedule", payload: { limit: 5 } });
    await db.job.update({ where: { id: job.id }, data: { status: "RUNNING", heartbeatAt: new Date(), lockedBy: "w" } });
    const again = await requestSiteJob(db, { type: "vitals", siteId: "s1", source: "manual", payload: { limit: 1 } });
    expect(again.job).toMatchObject({ status: "RUNNING", payload: { limit: 5 } });
  });

  it("a person's request runs a job waiting in backoff now, first in line", async () => {
    const waiting = await inBackoff();
    const { job, created } = await requestSiteJob(db, { type: GSC_SYNC_JOB, siteId: "s1", source: "manual" });
    expect(created).toBe(false);
    expect(job.id).toBe(waiting.id);
    expect(job.priority).toBe(10);
    expect(job.runAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("the schedule leaves a job in backoff alone", async () => {
    const waiting = await inBackoff();
    const { job } = await requestSiteJob(db, { type: GSC_SYNC_JOB, siteId: "s1", source: "schedule" });
    expect(job).toMatchObject({ priority: 0, runAt: waiting.runAt });
  });

  it("a running job is left alone", async () => {
    const { job } = await enqueueJob(db, { type: GSC_SYNC_JOB, siteId: "s1", source: "schedule" });
    await db.job.update({ where: { id: job.id }, data: { status: "RUNNING", heartbeatAt: new Date(), lockedBy: "w" } });
    const again = await requestSiteJob(db, { type: GSC_SYNC_JOB, siteId: "s1", source: "manual" });
    expect(again.job).toMatchObject({ status: "RUNNING", priority: 0 });
  });
});
