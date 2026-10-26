import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The read-only API on a real Prisma client (PGlite): key auth, user
// isolation, GET only, the rate limit, and the period parameters.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createAccessKey } from "@/lib/access-keys";
import { daysAgo, seedApiFixtures, snapshotUserData, type Fixtures } from "@/lib/testing/api-fixtures";
import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { handleApiV1 } from "./router";

let t: TestDb;
let db: PrismaClient;
let f: Fixtures;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  f = await seedApiFixtures(db);
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(() => {
  vi.unstubAllEnvs();
  (globalThis as { crawlseoApiRateLimiter?: unknown }).crawlseoApiRateLimiter = undefined;
});

function get(path: string, key: string | null = f.keyA, method = "GET") {
  const headers: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};
  return handleApiV1(new Request(`http://localhost/api/v1${path}`, { method, headers }));
}

async function body(res: Response) {
  return (await res.json()) as Record<string, unknown> & { error?: string };
}

describe("key auth", () => {
  it("refuses a request without a key", async () => {
    const res = await get("/sites", null);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    expect((await body(res)).error).toBe("Missing API key");
  });

  it("refuses a wrong key, a malformed header and a key with another prefix", async () => {
    for (const key of [`${f.keyA}x`, "crawlseo_nope", "sk-live-123"]) {
      const res = await get("/sites", key);
      expect(res.status, key).toBe(401);
      expect((await body(res)).error).toBe("Invalid API key");
    }
    const basic = await handleApiV1(
      new Request("http://localhost/api/v1/sites", { headers: { Authorization: `Basic ${f.keyA}` } })
    );
    expect(basic.status).toBe(401);
  });

  it("refuses a revoked key", async () => {
    const { id, key } = await createAccessKey(db, "user-a", "to revoke");
    expect((await get("/sites", key)).status).toBe(200);
    await db.accessKey.delete({ where: { id } });
    const res = await get("/sites", key);
    expect(res.status).toBe(401);
    expect((await body(res)).error).toBe("Invalid API key");
  });

  it("refuses a valid key while MCP is off for its user (the default), and says how to turn it on", async () => {
    const res = await get("/sites", f.keyOff);
    expect(res.status).toBe(403);
    expect((await body(res)).error).toMatch(/Settings > MCP/);
    const row = await db.accessKey.findFirstOrThrow({ where: { userId: "user-off" } });
    expect(row.lastUsedAt).toBeNull();
  });

  it("records when a key was used", async () => {
    await db.accessKey.update({ where: { id: f.keyAId }, data: { lastUsedAt: null } });
    await get("/sites");
    const row = await db.accessKey.findUniqueOrThrow({ where: { id: f.keyAId } });
    expect(row.lastUsedAt).toBeInstanceOf(Date);
  });
});

describe("read-only", () => {
  it("answers 405 to every method but GET, before looking at the key", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const key of [f.keyA, null]) {
        const res = await get("/sites/site-a", key, method);
        expect(res.status, method).toBe(405);
        expect(res.headers.get("allow")).toBe("GET");
      }
    }
  });

  it("no endpoint changes any data, a stale crawl included", async () => {
    const before = await snapshotUserData(db);
    for (const path of [
      "/sites",
      "/sites/site-a",
      "/sites/site-a/keywords",
      "/sites/site-a/pages",
      "/sites/site-a/traffic",
      "/sites/site-a/crawls",
      "/sites/site-a/crawls/latest/issues",
      "/sites/site-a/crawls/crawl-a2/issues",
      "/sites/site-a/vitals",
      "/sites/site-a/opportunities",
      "/sites/site-a/bing/traffic",
      "/sites/site-a/bing/keywords",
      "/sites/site-a/bing/pages",
    ]) {
      expect((await get(path)).status, path).toBe(200);
    }
    expect(await snapshotUserData(db)).toBe(before);
  });
});

describe("user isolation", () => {
  it("lists only the key owner's sites", async () => {
    const { sites } = (await body(await get("/sites"))) as unknown as { sites: { id: string }[] };
    expect(sites.map((s) => s.id)).toEqual(["site-a"]);
    const other = (await body(await get("/sites", f.keyB))) as unknown as { sites: { id: string }[] };
    expect(other.sites.map((s) => s.id)).toEqual(["site-b"]);
  });

  it("answers 404 for another user's site on every endpoint", async () => {
    for (const path of [
      "/sites/site-b",
      "/sites/site-b/keywords",
      "/sites/site-b/pages",
      "/sites/site-b/traffic",
      "/sites/site-b/crawls",
      "/sites/site-b/crawls/latest/issues",
      "/sites/site-b/crawls/crawl-b1/issues",
      "/sites/site-b/vitals",
      "/sites/site-b/opportunities",
      "/sites/site-b/bing/traffic",
      "/sites/site-b/bing/keywords",
      "/sites/site-b/bing/pages",
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(JSON.stringify(await body(res))).not.toContain("secret");
    }
  });

  it("does not show another user's crawl under one's own site", async () => {
    const res = await get("/sites/site-a/crawls/crawl-b1/issues");
    expect(res.status).toBe(404);
    expect((await body(res)).error).toBe("Crawl not found");
  });
});

describe("endpoints", () => {
  it("overview: metrics, the latest crawl (stale reads as FAILED) and vitals", async () => {
    const o = (await body(await get("/sites/site-a"))) as unknown as {
      site: { domain: string };
      metrics: { current: { clicks: number } };
      latestCrawl: { id: string; status: string; error: string };
      latestVitals: { perfScore: number };
    };
    expect(o.site.domain).toBe("quilltab.app");
    expect(o.metrics.current.clicks).toBeGreaterThan(0);
    expect(o.latestCrawl).toMatchObject({ id: "crawl-a2", status: "FAILED" });
    expect(o.latestCrawl.error).toMatch(/interrupted/i);
    expect(o.latestVitals.perfScore).toBeGreaterThan(0);
  });

  it("keywords and pages take days or a date range", async () => {
    const recent = (await body(await get("/sites/site-a/keywords?days=28"))) as unknown as { keywords: { query: string }[] };
    expect(recent.keywords.map((k) => k.query)).toEqual(["quilltab notes"]);

    const start = daysAgo(120).toISOString().slice(0, 10);
    const end = daysAgo(90).toISOString().slice(0, 10);
    const old = (await body(await get(`/sites/site-a/keywords?startDate=${start}&endDate=${end}`))) as unknown as {
      startDate: string;
      endDate: string;
      keywords: { query: string; clicks: number }[];
    };
    expect(old).toMatchObject({ startDate: start, endDate: end });
    expect(old.keywords).toEqual([expect.objectContaining({ query: "old query", clicks: 7 })]);

    const pages = (await body(await get("/sites/site-a/pages?days=7&limit=1"))) as unknown as { pages: { url: string }[] };
    expect(pages.pages).toEqual([expect.objectContaining({ url: "https://quilltab.app/" })]);
  });

  it("refuses bad parameters with 400", async () => {
    for (const q of [
      "days=0",
      "days=abc",
      "days=491",
      "startDate=2026-01-01",
      "startDate=2026-02-30&endDate=2026-03-01",
      "startDate=2026-03-01&endDate=2026-02-01",
      "startDate=2024-01-01&endDate=2026-01-01",
      "days=7&startDate=2026-01-01&endDate=2026-01-02",
      "limit=0",
      "limit=1e2",
      "days=0x10",
    ]) {
      const res = await get(`/sites/site-a/keywords?${q}`);
      expect(res.status, q).toBe(400);
    }
    expect((await get("/sites/site-a/crawls/latest/issues?severity=LOUD")).status).toBe(400);
    expect((await get("/sites/site-a/vitals?device=WATCH")).status).toBe(400);
  });

  it("days=N is the last N days, today included", async () => {
    const r = (await body(await get("/sites/site-a/traffic?days=7"))) as unknown as { startDate: string; endDate: string };
    expect((Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000 + 1).toBe(7);
    expect(r.endDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it("traffic is daily", async () => {
    const r = (await body(await get("/sites/site-a/traffic?days=7"))) as unknown as { days: { date: string; clicks: number }[] };
    expect(r.days.length).toBeGreaterThanOrEqual(6);
    expect(r.days[0]).toMatchObject({ clicks: 10 });
  });

  it("crawl issues: the latest completed crawl by default, internal rows hidden, severity filter", async () => {
    const r = (await body(await get("/sites/site-a/crawls/latest/issues"))) as unknown as {
      crawl: { id: string };
      total: number;
      bySeverity: Record<string, number>;
      issues: { type: string }[];
    };
    expect(r.crawl.id).toBe("crawl-a1");
    expect(r.total).toBe(2);
    expect(r.bySeverity).toEqual({ CRITICAL: 1, WARNING: 1, INFO: 0 });
    expect(r.issues.map((i) => i.type).sort()).toEqual(["BROKEN_LINK", "MISSING_DESCRIPTION"]);

    const critical = (await body(await get("/sites/site-a/crawls/crawl-a1/issues?severity=critical"))) as unknown as {
      issues: { severity: string }[];
    };
    expect(critical.issues).toEqual([expect.objectContaining({ severity: "CRITICAL" })]);
  });

  it("crawl issues: noindexWarning is null on a normal crawl and set when most fetched pages are noindex", async () => {
    const normal = (await body(await get("/sites/site-a/crawls/latest/issues"))) as unknown as { noindexWarning: unknown };
    expect(normal.noindexWarning).toBeNull();

    await db.auditPage.createMany({
      data: [
        ...Array.from({ length: 4 }, (_, i) => ({ crawlId: "crawl-b1", url: `https://b.example/${i}`, statusCode: 200, indexable: false })),
        { crawlId: "crawl-b1", url: "https://b.example/ok", statusCode: 200, indexable: true },
        { crawlId: "crawl-b1", url: "https://b.example/gone", statusCode: 404, indexable: true },
      ],
    });
    const r = (await body(await get("/sites/site-b/crawls/latest/issues", f.keyB))) as unknown as {
      noindexPages: number;
      noindexWarning: { noindexPages: number; fetchedPages: number; message: string };
    };
    expect(r.noindexWarning).toEqual({
      noindexPages: 4,
      fetchedPages: 5,
      message: "4 of 5 pages are noindex. If that is not intended, search engines will drop them.",
    });
    expect(r.noindexPages).toBe(4);
  });

  it("vitals filter by device", async () => {
    const r = (await body(await get("/sites/site-a/vitals?device=desktop"))) as unknown as { reports: { device: string }[] };
    expect(r.reports.map((v) => v.device)).toEqual(["DESKTOP"]);
  });

  it("key: the key in use, without its secret part", async () => {
    const r = (await body(await get("/key"))) as unknown as { key: { name: string; prefix: string } };
    expect(r.key.name).toBe("laptop");
    expect(f.keyA.startsWith(r.key.prefix)).toBe(true);
    expect(JSON.stringify(r)).not.toContain(f.keyA);
  });

  it("unknown paths are 404", async () => {
    for (const path of ["/", "/users", "/sites/site-a/backlinks", "/sites/site-a/crawls/crawl-a1", "/sites/%E0%A4%A/keywords"]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});

describe("Bing", () => {
  type BingRow = { clicks: number | null; impressions: number | null; position: number | null; weeks: number };

  it("sites list the Bing property", async () => {
    const { sites } = (await body(await get("/sites"))) as unknown as { sites: { bingSite: string | null }[] };
    expect(sites[0].bingSite).toBe("https://quilltab.app/");
  });

  it("keywords: weekly rows summed per query, position weighted by impressions, unreported totals stay null", async () => {
    const r = (await body(await get("/sites/site-a/bing/keywords"))) as unknown as {
      bingSite: string;
      keywords: (BingRow & { query: string })[];
    };
    expect(r.bingSite).toBe("https://quilltab.app/");
    expect(r.keywords).toEqual([
      { query: "quilltab bing", clicks: 6, impressions: 400, position: 5, weeks: 2 },
      { query: "unmeasured query", clicks: null, impressions: null, position: null, weeks: 1 },
    ]);
  });

  it("keywords: a week counts when it ends inside the period, and limit applies after sorting", async () => {
    const start = daysAgo(120).toISOString().slice(0, 10);
    const end = daysAgo(0).toISOString().slice(0, 10);
    const all = (await body(await get(`/sites/site-a/bing/keywords?startDate=${start}&endDate=${end}`))) as unknown as {
      keywords: { query: string }[];
    };
    expect(all.keywords.map((k) => k.query)).toEqual(["old bing query", "quilltab bing", "unmeasured query"]);
    const top = (await body(await get("/sites/site-a/bing/keywords?days=5&limit=1"))) as unknown as { keywords: BingRow[] };
    expect(top.keywords).toEqual([{ query: "quilltab bing", clicks: 4, impressions: 100, position: 2, weeks: 1 }]);
  });

  it("pages are summed the same way", async () => {
    const r = (await body(await get("/sites/site-a/bing/pages"))) as unknown as { pages: unknown[] };
    expect(r.pages).toEqual([{ url: "https://quilltab.app/", clicks: 3, impressions: 50, position: 4, weeks: 1 }]);
  });

  it("traffic: one row per day, oldest first, counters Bing left out are null", async () => {
    const r = (await body(await get("/sites/site-a/bing/traffic?days=12"))) as unknown as {
      days: { date: string; clicks: number | null; crawledPages: number | null; inIndex: number | null }[];
    };
    expect(r.days).toHaveLength(11);
    expect(r.days[0]).toMatchObject({ date: daysAgo(11).toISOString().slice(0, 10), clicks: null, crawledPages: 3, inIndex: null });
    expect(r.days[10]).toMatchObject({ date: daysAgo(1).toISOString().slice(0, 10), clicks: 2, crawledPages: 5, inIndex: 40 });
    expect(r.days.map((d) => d.date)).toEqual([...r.days.map((d) => d.date)].sort());
  });

  it("a site with no Bing property answers 404 and says so", async () => {
    await db.site.update({ where: { id: "site-a" }, data: { bingSite: null } });
    try {
      for (const path of ["/sites/site-a/bing/traffic", "/sites/site-a/bing/keywords", "/sites/site-a/bing/pages"]) {
        const res = await get(path);
        expect(res.status, path).toBe(404);
        expect((await body(res)).error).toBe("This site has no Bing Webmaster property connected");
      }
    } finally {
      await db.site.update({ where: { id: "site-a" }, data: { bingSite: "https://quilltab.app/" } });
    }
  });

  it("unknown Bing paths are 404", async () => {
    expect((await get("/sites/site-a/bing")).status).toBe(404);
    expect((await get("/sites/site-a/bing/backlinks")).status).toBe(404);
  });
});

describe("rate limit", () => {
  it("allows API_RATE_LIMIT_PER_MINUTE requests per key, then 429 with Retry-After", async () => {
    vi.stubEnv("API_RATE_LIMIT_PER_MINUTE", "3");
    for (let i = 0; i < 3; i++) {
      const res = await get("/sites");
      expect(res.status).toBe(200);
      expect(res.headers.get("x-ratelimit-remaining")).toBe(String(2 - i));
    }
    const limited = await get("/sites");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another key has its own count.
    expect((await get("/sites", f.keyB)).status).toBe(200);
  });
});
