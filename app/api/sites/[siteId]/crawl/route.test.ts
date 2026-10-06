import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// #57: a crawl left RUNNING by a server process that died made every new crawl
// for the site return 409, and the status endpoint reported it RUNNING forever.
// The route runs against the real Prisma client on PGlite; only auth and the
// crawl itself (network) are stubbed.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const runSiteCrawl = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("@/lib/crawler/engine", () => ({ runSiteCrawl }));

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
  await db.crawl.deleteMany();
  runSiteCrawl.mockClear();
});

const site = { params: Promise.resolve({ siteId: "s1" }) };

function runCrawl(maxPages = 50) {
  return POST(
    new Request("http://localhost/api/sites/s1/crawl", {
      method: "POST",
      body: JSON.stringify({ maxPages }),
    }),
    site
  );
}

describe("POST /api/sites/[siteId]/crawl (#57)", () => {
  it("a crawl stuck in RUNNING after a restart is marked failed and a new crawl starts", async () => {
    // The repro from the issue: RUNNING, started 3 hours ago, process gone.
    await db.crawl.create({
      data: { id: "stuck", siteId: "s1", status: "RUNNING", startedAt: new Date(Date.now() - 3 * HOUR) },
    });

    const res = await runCrawl();
    expect(res.status).toBe(202);
    const body = (await res.json()) as { crawlId: string };
    expect(body.crawlId).not.toBe("stuck");

    const stuck = await db.crawl.findUniqueOrThrow({ where: { id: "stuck" } });
    expect(stuck.status).toBe("FAILED");
    expect(stuck.finishedAt).not.toBeNull();
    expect(stuck.error).toBe(INTERRUPTED);

    const started = await db.crawl.findUniqueOrThrow({ where: { id: body.crawlId } });
    expect(started.status).toBe("PENDING");
    expect(started.maxPages).toBe(50);
    expect(runSiteCrawl).toHaveBeenCalledWith("s1", "quilltab.app", 50, body.crawlId);
  });

  it("a genuinely running crawl still returns 409", async () => {
    await db.crawl.create({
      data: { id: "live", siteId: "s1", status: "RUNNING", startedAt: new Date() },
    });

    const res = await runCrawl();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "A crawl is already running", crawlId: "live" });
    expect(runSiteCrawl).not.toHaveBeenCalled();
    expect((await db.crawl.findUniqueOrThrow({ where: { id: "live" } })).status).toBe("RUNNING");
    expect(await db.crawl.count()).toBe(1);
  });
});

describe("GET /api/sites/[siteId]/crawl/[crawlId]/status (#57)", () => {
  it("reports a stuck crawl as FAILED with the message, so the banner stops", async () => {
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
