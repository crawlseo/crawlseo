import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A crawl end to end through the queue: the crawl route queues it, a worker
// loop claims it and runs the real engine (DNS and HTTP stubbed), and the job
// and crawl rows end up the way the UI and MCP read them. Real Prisma client
// on PGlite.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("next/server", () => ({ after: vi.fn() }));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { POST } from "@/app/api/sites/[siteId]/crawl/route";
import { GET as getJob } from "@/app/api/jobs/[jobId]/route";
import { JobLoop } from "./loop";
import { JobRunner } from "./runner";
import { RELEASED_MESSAGE } from "./types";

const PAGES = 12;

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

let slow = false;

beforeEach(async () => {
  await db.job.deleteMany();
  await db.crawl.deleteMany();
  slow = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: { signal?: AbortSignal }) => {
      const url = new URL(String(input));
      if (slow && url.pathname.startsWith("/p")) {
        // Hangs until the crawl is stopped.
        await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
      }
      if (url.pathname === "/") {
        const links = Array.from({ length: PAGES }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("");
        return html(links);
      }
      if (url.pathname.startsWith("/p")) return html(`page ${url.pathname}`);
      return new Response("not found", { status: 404 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function html(body: string) {
  return new Response(`<html><head><title>${body}</title></head><body><h1>${body}</h1>${body}</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

function worker() {
  const runner = new JobRunner(db, { log: () => {} });
  return new JobLoop(db, runner, {
    mode: "worker",
    longConcurrency: 1,
    shortConcurrency: 1,
    pollMs: 60_000,
    staleMs: 180_000,
    log: () => {},
  });
}

async function queueCrawl(maxPages: number) {
  const res = await POST(
    new Request("http://localhost/api/sites/s1/crawl", { method: "POST", body: JSON.stringify({ maxPages }) }),
    { params: Promise.resolve({ siteId: "s1" }) }
  );
  expect(res.status).toBe(202);
  return ((await res.json()) as { jobId: string }).jobId;
}

describe("a crawl through the worker", () => {
  it("is queued by the route, run by the worker, and reported by the jobs API", async () => {
    vi.stubEnv("WORKER_MODE", "off"); // the app only queues; the worker below runs it
    const jobId = await queueCrawl(50);
    expect(await db.crawl.count()).toBe(0);

    await worker().drain();

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ status: "SUCCEEDED", attempts: 1, activeKey: null });
    const crawl = await db.crawl.findUniqueOrThrow({ where: { id: job.crawlId! } });
    expect(crawl).toMatchObject({ status: "COMPLETED", pagesFound: PAGES + 1, maxPages: 50 });
    expect(await db.auditPage.count({ where: { crawlId: crawl.id } })).toBe(PAGES + 1);
    expect(job.result).toMatchObject({ crawlId: crawl.id, pagesFound: PAGES + 1 });

    const res = await getJob(new Request("http://localhost"), { params: Promise.resolve({ jobId }) });
    expect(await res.json()).toMatchObject({
      id: jobId,
      type: "crawl",
      status: "SUCCEEDED",
      crawl: { id: crawl.id, status: "COMPLETED", pagesFound: PAGES + 1 },
      stalled: false,
    });
  });

  it("crawls no more than the server's page ceiling", async () => {
    vi.stubEnv("CRAWL_MAX_PAGES", "5");
    const jobId = await queueCrawl(999_999);
    await worker().drain();
    const job = await db.job.findUniqueOrThrow({ where: { id: jobId }, include: { crawl: true } });
    expect(job.crawl).toMatchObject({ status: "COMPLETED", pagesFound: 5, maxPages: 5 });
  });

  it("a worker shutdown stops the crawl, queues it again, and the next worker crawls it", async () => {
    slow = true;
    const jobId = await queueCrawl(50);
    const first = worker();
    await first.tick();
    await vi.waitFor(async () => expect((await db.job.findUniqueOrThrow({ where: { id: jobId } })).crawlId).not.toBeNull());
    const stopped = (await db.job.findUniqueOrThrow({ where: { id: jobId } })).crawlId!;

    await first.stop(1_000);
    expect(await db.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status: "QUEUED", attempts: 0 });
    expect(await db.crawl.findUniqueOrThrow({ where: { id: stopped } })).toMatchObject({
      status: "FAILED",
      error: RELEASED_MESSAGE,
    });

    slow = false;
    await worker().drain();
    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ status: "SUCCEEDED", attempts: 1 });
    expect(job.crawlId).not.toBe(stopped);
    expect((await db.crawl.findUniqueOrThrow({ where: { id: job.crawlId! } })).status).toBe("COMPLETED");
  });
});
