import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// #105: a noindex page is crawled and its links followed, but its issues do
// not count: not in the health score, not in the issues, not in the content
// average. Real Prisma client on PGlite; DNS and fetch are stubbed.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { runSiteCrawl } from "./engine";
import { getVisibleIssues } from "./issue-filter";
import { getCrawlPageStats } from "./page-stats";
import { crawlIssues } from "@/lib/api-v1/handlers";

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
  vi.unstubAllGlobals();
});

const GOOD_HEAD =
  '<title>A well formed page title</title><meta name="description" content="A description of this page that is long enough to count as one.">' +
  '<link rel="canonical" href="https://quilltab.app/"><script type="application/ld+json">{}</script>';

function page(head: string, body: string, headers: Record<string, string> = {}) {
  return new Response(`<html><head>${head}</head><body>${body}</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html", ...headers },
  });
}

/**
 * A site whose home page links to /good and, when `withNoindex`, to two
 * noindex pages full of defects: no title, description, H1, canonical or
 * schema, an image without alt, a duplicate of each other, and a link on.
 */
function stubSite(withNoindex: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const { pathname } = new URL(String(input));
      const bare = '<img src="/x.png"><a href="/good">good</a>';
      switch (pathname) {
        case "/":
          return page(
            GOOD_HEAD.replace("A well formed", "Home, a well formed"),
            `<h1>Home</h1><a href="/good">good</a>${withNoindex ? '<a href="/meta">m</a><a href="/header">h</a>' : ""}`
          );
        case "/good":
          return page(GOOD_HEAD, '<h1>Good</h1><a href="/">home</a>');
        case "/meta":
          return page('<meta name="robots" content="noindex, follow">', bare);
        case "/header":
          return page("", bare, { "x-robots-tag": "googlebot: noindex" });
        default:
          return new Response("not found", { status: 404 });
      }
    })
  );
}

describe("crawl with noindex pages", () => {
  it("keeps them out of the health score, the issues and the content average, and lists them", async () => {
    stubSite(false);
    const without = await runSiteCrawl("s1", "quilltab.app", 50);
    stubSite(true);
    const withNoindex = await runSiteCrawl("s1", "quilltab.app", 50);

    // Crawled: two more pages, both stored.
    expect(withNoindex.pagesFound).toBe(without.pagesFound + 2);
    expect(withNoindex.noindexPages).toBe(2);
    expect(without.noindexPages).toBe(0);

    // Not scored: the health score, the issues and the content average are
    // those of the site without them.
    expect(withNoindex.healthScore).toBe(without.healthScore);
    expect(withNoindex.issuesFound).toBe(without.issuesFound);
    expect(withNoindex.avgContentScore).toBe(without.avgContentScore);
    const issues = await getVisibleIssues(db, withNoindex.crawlId);
    expect(issues.issues.filter((i) => /\/(meta|header)$/.test(i.url))).toEqual([]);
    expect(issues.bySeverity).toEqual((await getVisibleIssues(db, without.crawlId)).bySeverity);
    const internal = await db.crawlIssue.findMany({
      where: { crawlId: withNoindex.crawlId, url: { in: ["https://quilltab.app/meta", "https://quilltab.app/header"] } },
    });
    expect(internal).toEqual([]);

    // Listed: stored with where the noindex came from, and counted.
    const rows = await db.auditPage.findMany({
      where: { crawlId: withNoindex.crawlId, indexable: false },
      select: { url: true, noindexSource: true, xRobotsTag: true },
      orderBy: { url: "asc" },
    });
    expect(rows).toEqual([
      { url: "https://quilltab.app/header", noindexSource: "x-robots-tag", xRobotsTag: "googlebot: noindex" },
      { url: "https://quilltab.app/meta", noindexSource: "meta", xRobotsTag: null },
    ]);
    const stats = await getCrawlPageStats(db, withNoindex.crawlId);
    expect(stats.noindex).toBe(2);
    expect(stats.pages).toBe(withNoindex.pagesFound);
    expect(stats.avgContentScore).toBe((await getCrawlPageStats(db, without.crawlId)).avgContentScore);

    // The read API says the same.
    const site = { id: "s1", domain: "quilltab.app", gscProperty: null };
    const api = await crawlIssues(site, withNoindex.crawlId, new URLSearchParams());
    expect(api.noindexPages).toBe(2);
    expect(api.crawl.healthScore).toBe(without.healthScore);
    expect(api.total).toBe(without.issuesFound);
  });
});
