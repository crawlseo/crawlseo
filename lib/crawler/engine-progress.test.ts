import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// A live crawl records progress while it runs, so the stale crawl rule (#57)
// never mistakes it for one whose process died. Real Prisma client on PGlite;
// DNS and fetch are stubbed, and only Date is faked so each fetch can move the
// clock forward without slowing the test.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) }));

vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { runSiteCrawl } from "./engine";

const PAGES = 20; // home + 20 pages: batches of 1, 15 and 5

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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function html(body: string) {
  return new Response(`<html><head><title>${body}</title></head><body><h1>${body}</h1>${body}</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

describe("runSiteCrawl progress", () => {
  it("records lastProgressAt and pagesFound while the crawl runs, and clears error on completion", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const seen: { pagesFound: number; status: string; lastProgressAt: Date | null }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        // Every request takes 2 s of (fake) time.
        vi.setSystemTime(Date.now() + 2000);
        const url = new URL(String(input));
        if (url.pathname === "/") {
          const links = Array.from({ length: PAGES }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("");
          return html(links);
        }
        if (url.pathname.startsWith("/p")) {
          // The first page of the last batch: what does the row say mid-crawl?
          if (url.pathname === "/p15") {
            const row = await db.crawl.findFirstOrThrow({ where: { siteId: "s1" } });
            seen.push({ pagesFound: row.pagesFound, status: row.status, lastProgressAt: row.lastProgressAt });
          }
          return html(`page ${url.pathname}`);
        }
        return new Response("not found", { status: 404 });
      })
    );

    const started = new Date();
    const result = await runSiteCrawl("s1", "quilltab.app", 50);
    expect(result.pagesFound).toBe(PAGES + 1);

    // Mid-crawl the row was RUNNING, with the pages of the first two batches
    // and a progress time well after the start.
    expect(seen).toHaveLength(1);
    expect(seen[0].status).toBe("RUNNING");
    expect(seen[0].pagesFound).toBe(16);
    expect(seen[0].lastProgressAt!.getTime()).toBeGreaterThan(started.getTime() + 5000);

    const done = await db.crawl.findUniqueOrThrow({ where: { id: result.crawlId } });
    expect(done.status).toBe("COMPLETED");
    expect(done.error).toBeNull();
    expect(done.lastProgressAt!.getTime()).toBeGreaterThanOrEqual(seen[0].lastProgressAt!.getTime());
  });
});
