import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/jobs/[jobId] against the real Prisma client on PGlite.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { GET } from "./route";

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "a@quilltab.app" } });
  await db.user.create({ data: { id: "u2", email: "b@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "a.example" } });
  await db.site.create({ data: { id: "s2", userId: "u2", domain: "b.example" } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  await db.workerHeartbeat.deleteMany();
  vi.unstubAllEnvs();
});

const get = (jobId: string) => GET(new Request("http://localhost"), { params: Promise.resolve({ jobId }) });

function job(siteId: string, data: Partial<{ runAt: Date; status: "QUEUED" | "FAILED"; errorCode: string; lastError: string }> = {}) {
  return db.job.create({ data: { siteId, type: "gsc-sync", source: "manual", maxAttempts: 3, ...data } });
}

describe("GET /api/jobs/[jobId]", () => {
  it("returns the job to the site's owner", async () => {
    const j = await job("s1", { status: "FAILED", errorCode: "REAUTH_REQUIRED", lastError: "Google access expired" });
    const res = await get(j.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: j.id,
      type: "gsc-sync",
      status: "FAILED",
      errorCode: "REAUTH_REQUIRED",
      lastError: "Google access expired",
      crawl: null,
      stalled: false,
    });
  });

  it("answers 404 for another user's job and for one that does not exist", async () => {
    const other = await job("s2");
    expect((await get(other.id)).status).toBe(404);
    expect((await get("nope")).status).toBe(404);
  });

  it("marks a job stalled when it waited over 2 minutes and no process picks jobs up", async () => {
    const j = await job("s1", { runAt: new Date(Date.now() - 5 * 60_000) });
    expect((await (await get(j.id)).json()).stalled).toBe(true);

    await db.workerHeartbeat.create({
      data: { id: "w1", mode: "worker", hostname: "h", version: "0", startedAt: new Date(), lastSeenAt: new Date() },
    });
    expect((await (await get(j.id)).json()).stalled).toBe(false);
  });

  it("never marks a job stalled on a serverless host, where nothing polls", async () => {
    vi.stubEnv("VERCEL", "1");
    const j = await job("s1", { runAt: new Date(Date.now() - 5 * 60_000) });
    expect((await (await get(j.id)).json()).stalled).toBe(false);
  });
});
