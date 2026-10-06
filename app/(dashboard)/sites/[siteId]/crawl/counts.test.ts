import type { PrismaClient } from "@prisma/client";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// #56: the Crawl / Audit header said "42 pages crawled · 24 stored". The 42 was
// the stored pagesFound, the 24 the length of a list capped at 200 rows, and
// the table showed the first 100 of those as "Showing 100 of 100 pages". The
// content average and the orphan count were computed over the capped rows.
// The pages render against the real Prisma client on PGlite; only auth, the
// crawl activity banner and the overview's async widgets are stubbed.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("@/lib/crawler/lifecycle", () => ({
  getCrawlActivity: async () => ({ active: null, failed: null }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/sites/s1/crawl",
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/seo-opportunities", () => ({ getAllOpportunities: async () => ({ feed: [] }) }));
vi.mock("@/components/dashboard/metrics", () => ({ DashboardMetrics: () => null }));
vi.mock("@/components/dashboard/traffic-chart", () => ({ TrafficChart: () => null }));
vi.mock("@/components/dashboard/top-keywords", () => ({ TopKeywords: () => null }));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { getCrawlPageStats } from "@/lib/crawler/page-stats";
import { paginate } from "@/components/sites/crawled-pages-table";
import CrawlPage from "./page";
import SiteOverviewPage from "../page";

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "quilltab.app" } });
  // The overview renders its Site checks card only once GSC data exists.
  await db.keyword.create({ data: { siteId: "s1", query: "invoicing app", date: new Date() } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.crawl.deleteMany();
});

const params = { params: Promise.resolve({ siteId: "s1" }) };

// renderToString separates adjacent text with <!-- -->; drop it to match text.
const text = (html: string) => html.replace(/<!-- -->/g, "");

async function renderCrawl(): Promise<string> {
  return text(renderToString(await CrawlPage(params)));
}

async function renderOverview(): Promise<string> {
  return text(renderToString(await SiteOverviewPage(params)));
}

/** A completed crawl with `n` AuditPage rows; page i scores i % 101. */
async function crawlWithPages(n: number, pagesFound = n) {
  await db.crawl.create({
    data: { id: "c1", siteId: "s1", status: "COMPLETED", finishedAt: new Date(), pagesFound },
  });
  await db.auditPage.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      crawlId: "c1",
      url: `https://quilltab.app/p/${String(i).padStart(4, "0")}`,
      statusCode: 200,
      contentScore: i % 101,
      // Every page links somewhere, so an outlink-based "orphan" count is 0.
      internalLinks: 3,
    })),
  });
}

function averageScore(n: number) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += i % 101;
  return Math.round(sum / n);
}

describe("Crawl / Audit page counts (#56)", () => {
  it("shows one page count, from the stored rows, when pagesFound disagrees (the demo seed)", async () => {
    await crawlWithPages(24, 42);
    const html = await renderCrawl();
    expect(html).toContain("24 pages crawled");
    expect(html).not.toContain("42 pages");
    expect(html).not.toContain("24 stored");
    expect(html).toContain("24 pages, each stored with full metadata");
    expect(html).toContain("Showing 24 of 24 pages");
    expect(html).not.toContain("Page 1 of");
  });

  it("a crawl of 205 pages: header, table and averages cover all 205", async () => {
    await crawlWithPages(205);
    const html = await renderCrawl();

    expect(html).toContain("205 pages crawled");
    expect(html).not.toContain("200 stored");
    expect(html).toContain("205 pages, each stored with full metadata");
    expect(html).toContain("Showing 100 of 205 pages, 1 to 100");
    expect(html).toContain("Page 1 of 3");
    expect((html.match(/https:\/\/quilltab\.app\/p\//g) ?? []).length).toBe(2 * 100); // title + text
    expect(html).toContain(`content avg ${averageScore(205)}/100`);
  });

  it("the table holds every page, so the last page and the URL filter reach the rest", async () => {
    await crawlWithPages(205);
    const rows = await db.auditPage.findMany({ where: { crawlId: "c1" }, orderBy: { url: "asc" } });
    expect(paginate(rows, 205, 2).summary).toBe("Showing 5 of 205 pages, 201 to 205");
    expect(paginate(rows, 205, 2).shown.map((r) => r.url.slice(-4))).toEqual(["0200", "0201", "0202", "0203", "0204"]);
    // An index past the end shows the last page.
    expect(paginate(rows, 205, 9).current).toBe(2);
    const matching = rows.filter((r) => r.url.endsWith("7"));
    expect(paginate(matching, 205, 0).summary).toBe("Showing 20 of 20 matching pages (205 in total)");
    expect(paginate(rows.slice(204), 205, 0).summary).toBe("Showing 1 of 1 matching page (205 in total)");
  });

  it("orphans come from the crawl summary, not from the outlinks of the listed rows", async () => {
    await crawlWithPages(205);
    await db.crawlIssue.create({
      data: {
        crawlId: "c1",
        url: "https://quilltab.app/",
        type: "MISSING_SCHEMA",
        severity: "INFO",
        message: "Crawl summary",
        details: { kind: "crawl_summary", pages: [{ url: "https://quilltab.app/" }], orphans: 73 },
      },
    });
    expect(await getCrawlPageStats(db, "c1")).toEqual({ pages: 205, avgContentScore: averageScore(205), orphans: 73 });
    const html = await renderCrawl();
    expect(html).toMatch(/Orphans \(no inbound link\)<\/span><span[^>]*>73</);
  });

  it("without a crawl summary, orphans are the orphan issues", async () => {
    await crawlWithPages(10);
    for (const id of ["a", "b", "c"]) {
      await db.crawlIssue.create({
        data: {
          crawlId: "c1",
          url: `https://quilltab.app/${id}`,
          type: "MISSING_CANONICAL",
          severity: "WARNING",
          message: "Potential orphan page (no internal inlinks found)",
          details: { kind: "orphan", contentScore: 40 },
        },
      });
    }
    expect((await getCrawlPageStats(db, "c1")).orphans).toBe(3);
  });

  it("the overview Site checks card counts the same stored pages", async () => {
    await crawlWithPages(24, 42);
    const html = await renderOverview();
    expect(html).toContain("24 pages · 0 issues");
    expect(html).not.toContain("42 pages");
  });
});
