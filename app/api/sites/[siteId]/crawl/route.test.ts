import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The crawl route queues a crawl job. #57: a crawl whose process died must not
// block new crawls forever. The route runs against the real Prisma client on
// PGlite; only auth and next/server's after() are stubbed.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const after = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("next/server", () => ({ after }));
const canStartCrawl = vi.hoisted(() => vi.fn());
vi.mock("@/lib/jobs/policy", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/jobs/policy")>();
  canStartCrawl.mockImplementation(real.canStartCrawl);
  return { ...real, canStartCrawl };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { POST } from "./route";
import { GET as getStatus } from "./[crawlId]/status/route";

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
  await db.job.deleteMany();
  await db.crawl.deleteMany();
  after.mockClear();
  canStartCrawl.mockClear();
  vi.unstubAllEnvs();
});

const site = { params: Promise.resolve({ siteId: "s1" }) };

function runCrawl(maxPages: unknown = 50) {
  return POST(
    new Request("http://localhost/api/sites/s1/crawl", {
      method: "POST",
      body: JSON.stringify({ maxPages }),
    }),
    site
  );
}

async function queuedWith(res: Response) {
  expect(res.status).toBe(202);
  const body = (await res.json()) as { jobId: string; status: string; maxPages: number };
  expect(body.status).toBe("QUEUED");
  const job = await db.job.findUniqueOrThrow({ where: { id: body.jobId } });
  expect(job).toMatchObject({ type: "crawl", siteId: "s1", status: "QUEUED", source: "manual", priority: 10 });
  expect(body.maxPages).toBe((job.payload as { maxPages: number }).maxPages);
  return body.maxPages;
}

async function runningCrawlJob(opts: { heartbeatAt: Date; attempts: number }) {
  await db.crawl.create({ data: { id: "c-old", siteId: "s1", status: "RUNNING", startedAt: opts.heartbeatAt } });
  return db.job.create({
    data: {
      siteId: "s1",
      type: "crawl",
      source: "manual",
      status: "RUNNING",
      maxAttempts: 2,
      attempts: opts.attempts,
      activeKey: "crawl:s1",
      lockedBy: "gone:1:abc",
      lockedAt: opts.heartbeatAt,
      heartbeatAt: opts.heartbeatAt,
      crawlId: "c-old",
    },
  });
}

describe("POST /api/sites/[siteId]/crawl", () => {
  it("queues a crawl job with the requested page limit and answers 202", async () => {
    expect(await queuedWith(await runCrawl(50))).toBe(50);
    // No crawl row yet: the attempt creates it when it starts.
    expect(await db.crawl.count()).toBe(0);
    // Not a serverless host: nothing runs in this request.
    expect(after).not.toHaveBeenCalled();
  });

  it("a crawl job already queued runs next with the new page limit (202, alreadyActive)", async () => {
    const first = (await (await runCrawl(30)).json()) as { jobId: string };
    await db.job.update({ where: { id: first.jobId }, data: { priority: 0 } }); // e.g. a scheduled one
    const res = await runCrawl(80);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ jobId: first.jobId, status: "QUEUED", maxPages: 80, alreadyActive: true });
    expect(await db.job.findUniqueOrThrow({ where: { id: first.jobId } })).toMatchObject({ priority: 10, payload: { maxPages: 80 } });
    expect(await db.job.count()).toBe(1);
  });

  it("a person's request runs a crawl job waiting in backoff now", async () => {
    const first = (await (await runCrawl(30)).json()) as { jobId: string };
    const later = new Date(Date.now() + 25 * 60_000);
    await db.job.update({ where: { id: first.jobId }, data: { runAt: later, attempts: 1, lastError: "timeout" } });

    const before = Date.now();
    expect((await runCrawl(30)).status).toBe(202);
    const row = await db.job.findUniqueOrThrow({ where: { id: first.jobId } });
    expect(row.runAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(row.runAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("a running crawl job returns 409 with its job id", async () => {
    const job = await runningCrawlJob({ heartbeatAt: new Date(), attempts: 1 });
    const res = await runCrawl();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "A crawl is already running", jobId: job.id, crawlId: "c-old" });
  });

  it("#57: a crawl job whose process died is queued again; its crawl row is marked failed", async () => {
    const stuck = await runningCrawlJob({ heartbeatAt: new Date(Date.now() - 3 * HOUR), attempts: 1 });

    const res = await runCrawl();
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ jobId: stuck.id, alreadyActive: true });
    const job = await db.job.findUniqueOrThrow({ where: { id: stuck.id } });
    expect(job.status).toBe("QUEUED");
    expect(job.errorCode).toBe("INTERRUPTED");
    const crawl = await db.crawl.findUniqueOrThrow({ where: { id: "c-old" } });
    expect(crawl.status).toBe("FAILED");
    expect(crawl.error).toBe(INTERRUPTED);
  });

  it("#57: a dead crawl job out of attempts fails, and a new crawl is queued", async () => {
    const stuck = await runningCrawlJob({ heartbeatAt: new Date(Date.now() - 3 * HOUR), attempts: 2 });

    await queuedWith(await runCrawl());
    expect((await db.job.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe("FAILED");
  });

  it("a crawl job with a fresh heartbeat still returns 409", async () => {
    await runningCrawlJob({ heartbeatAt: new Date(), attempts: 1 });
    expect((await runCrawl()).status).toBe(409);
  });

  it("on a serverless host the crawl runs after the response", async () => {
    vi.stubEnv("VERCEL", "1");
    await queuedWith(await runCrawl());
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("on a serverless host a crawl job left queued is run by the next request", async () => {
    vi.stubEnv("VERCEL", "1");
    const first = (await (await runCrawl()).json()) as { jobId: string };
    after.mockClear();

    const res = await runCrawl();
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ jobId: first.jobId, alreadyActive: true });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("WORKER_MODE=off only queues, even on a serverless host", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("WORKER_MODE", "off");
    await queuedWith(await runCrawl());
    expect(after).not.toHaveBeenCalled();
  });
});

describe("POST /api/sites/[siteId]/crawl page ceiling", () => {
  it("clamps a page count above the default ceiling of 2000", async () => {
    expect(await queuedWith(await runCrawl(999_999))).toBe(2000);
  });

  it("clamps to CRAWL_MAX_PAGES when it is set", async () => {
    vi.stubEnv("CRAWL_MAX_PAGES", "40");
    expect(await queuedWith(await runCrawl(50))).toBe(40);
  });

  it("uses 200 pages for a missing or invalid page count", async () => {
    expect(await queuedWith(await runCrawl("2000"))).toBe(200);
    await db.job.deleteMany();
    expect(await queuedWith(await runCrawl(-3))).toBe(200);
  });

  it("asks the policy before queueing and returns its refusal", async () => {
    canStartCrawl.mockResolvedValueOnce({ ok: false, reason: "Not now", status: 429 });
    const res = await runCrawl(50);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Not now" });
    expect(canStartCrawl).toHaveBeenCalledWith({ id: "s1", userId: "u1" }, { source: "manual", maxPages: 50 });
    expect(await db.job.count()).toBe(0);
  });
});

describe("GET /api/sites/[siteId]/crawl/[crawlId]/status (#57)", () => {
  it("reports a stuck crawl from before the queue as FAILED with the message, so the banner stops", async () => {
    await db.crawl.create({
      data: { id: "stuck", siteId: "s1", status: "RUNNING", startedAt: new Date(Date.now() - 3 * HOUR) },
    });

    const res = await getStatus(new Request("http://localhost"), {
      params: Promise.resolve({ siteId: "s1", crawlId: "stuck" }),
    });
    const body = (await res.json()) as { status: string; error?: string; finishedAt: string | null };
    expect(body.status).toBe("FAILED");
    expect(body.error).toBe(INTERRUPTED);
    expect(body.finishedAt).not.toBeNull();
  });
});
