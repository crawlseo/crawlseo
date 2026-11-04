import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
      "/sites/site-a/saved-keywords",
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
      "/sites/site-b/saved-keywords",
      "/sites/site-b/url-inspection?url=https%3A%2F%2Fsecret-b.com%2F",
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

describe("saved keywords", () => {
  type Saved = { query: string; notes: string | null; savedAt: string; clicks: number | null; impressions: number | null; position: number | null; ctr: number | null };

  it("newest first, with the same totals get_keywords gives for that query and period", async () => {
    const r = (await body(await get("/sites/site-a/saved-keywords"))) as unknown as { startDate: string; endDate: string; savedKeywords: Saved[] };
    const kw = (await body(await get("/sites/site-a/keywords?limit=1000"))) as unknown as { startDate: string; keywords: { query: string }[] };
    expect(r.startDate).toBe(kw.startDate);
    expect(r.savedKeywords.map((s) => s.query)).toEqual(["never seen query", "quilltab notes"]);
    const row = kw.keywords.find((k) => k.query === "quilltab notes")!;
    expect(r.savedKeywords[1]).toEqual({ ...row, notes: null, savedAt: daysAgo(5).toISOString() });
    expect(r.savedKeywords[1].clicks).toBeGreaterThan(0);
  });

  it("a saved keyword with no Search Console row in the period has null totals, and keeps its notes", async () => {
    const r = (await body(await get("/sites/site-a/saved-keywords"))) as unknown as { savedKeywords: Saved[] };
    expect(r.savedKeywords[0]).toEqual({
      query: "never seen query",
      notes: "launch target",
      savedAt: daysAgo(2).toISOString(),
      clicks: null,
      impressions: null,
      position: null,
      ctr: null,
    });
  });

  it("takes a date range; outside the data every total is null", async () => {
    const r = (await body(await get("/sites/site-a/saved-keywords?startDate=2020-01-01&endDate=2020-01-31"))) as unknown as { savedKeywords: Saved[] };
    expect(r.savedKeywords.map((s) => s.clicks)).toEqual([null, null]);
    expect((await get("/sites/site-a/saved-keywords?days=0")).status).toBe(400);
  });
});

describe("URL inspection", () => {
  const INSPECTED = {
    inspectionResult: {
      inspectionResultLink: "https://search.google.com/search-console/inspect?resource_id=sc-domain:quilltab.app&id=abc",
      indexStatusResult: {
        verdict: "PASS",
        coverageState: "Submitted and indexed",
        robotsTxtState: "ALLOWED",
        indexingState: "INDEXING_ALLOWED",
        lastCrawlTime: "2026-11-01T08:30:00Z",
        pageFetchState: "SUCCESSFUL",
        googleCanonical: "https://quilltab.app/notes",
        userCanonical: "https://quilltab.app/notes",
        sitemap: ["https://quilltab.app/sitemap.xml"],
        referringUrls: ["https://quilltab.app/"],
        crawledAs: "MOBILE",
      },
      mobileUsabilityResult: { verdict: "VERDICT_UNSPECIFIED" },
    },
  };
  const calls: { url: string; auth: string | null; body: unknown }[] = [];

  function stubGoogle(status = 200, json: unknown = INSPECTED) {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        calls.push({ url: input, auth: new Headers(init?.headers).get("authorization"), body: init?.body && JSON.parse(String(init.body)) });
        return Response.json(json, { status });
      })
    );
  }

  const inspect = (url: string, key = f.keyA) => get(`/sites/site-a/url-inspection?url=${encodeURIComponent(url)}`, key);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks Google about the URL with the user's token and the site's property, and changes nothing", async () => {
    stubGoogle();
    const before = await snapshotUserData(db);
    const res = await inspect("https://quilltab.app/notes");
    expect(res.status).toBe(200);
    expect(calls).toEqual([
      {
        url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        auth: "Bearer test-access-a",
        body: { inspectionUrl: "https://quilltab.app/notes", siteUrl: "sc-domain:quilltab.app" },
      },
    ]);
    const { site, ...r } = await body(res);
    expect(site).toMatchObject({ id: "site-a" });
    expect(r).toEqual({
      url: "https://quilltab.app/notes",
      inspectionResultLink: INSPECTED.inspectionResult.inspectionResultLink,
      ...INSPECTED.inspectionResult.indexStatusResult,
    });
    expect(await snapshotUserData(db)).toBe(before);
  });

  it("fields Google leaves out are null, lists are empty", async () => {
    stubGoogle(200, { inspectionResult: { indexStatusResult: { verdict: "NEUTRAL", coverageState: "URL is unknown to Google" } } });
    const r = await body(await inspect("https://quilltab.app/new"));
    expect(r).toMatchObject({ verdict: "NEUTRAL", lastCrawlTime: null, googleCanonical: null, inspectionResultLink: null, sitemap: [], referringUrls: [] });
  });

  it("a domain property covers its host and subdomains on http and https, nothing else", async () => {
    stubGoogle();
    for (const url of ["https://quilltab.app/", "http://quilltab.app/a?b=1", "https://www.quilltab.app/x", "https://QUILLTAB.app/y"]) {
      expect((await inspect(url)).status, url).toBe(200);
    }
    for (const url of ["https://example.com/", "https://quilltab.app.example.com/", "https://notquilltab.app/"]) {
      const res = await inspect(url);
      expect(res.status, url).toBe(400);
      expect((await body(res)).error).toMatch(/not in this site's Search Console property/);
    }
  });

  it("a URL-prefix property covers the URLs that start with it", async () => {
    stubGoogle();
    await db.site.update({ where: { id: "site-a" }, data: { gscProperty: "https://www.quilltab.app/blog/" } });
    try {
      expect((await inspect("https://www.quilltab.app/blog/post")).status).toBe(200);
      expect(calls.at(-1)?.body).toEqual({ inspectionUrl: "https://www.quilltab.app/blog/post", siteUrl: "https://www.quilltab.app/blog/" });
      for (const url of ["https://www.quilltab.app/", "http://www.quilltab.app/blog/post", "https://quilltab.app/blog/post", "https://www.quilltab.app/blogger"]) {
        expect((await inspect(url)).status, url).toBe(400);
      }
    } finally {
      await db.site.update({ where: { id: "site-a" }, data: { gscProperty: "sc-domain:quilltab.app" } });
    }
  });

  it("a URL-prefix property stored without its trailing slash still ends at a path boundary", async () => {
    stubGoogle();
    await db.site.update({ where: { id: "site-a" }, data: { gscProperty: "https://www.quilltab.app" } });
    try {
      for (const url of ["https://www.quilltab.app/", "https://www.quilltab.app/blog/post"]) {
        expect((await inspect(url)).status, url).toBe(200);
      }
      for (const url of ["https://www.quilltab.app.example.com/", "https://www.quilltab.appx/"]) {
        expect((await inspect(url)).status, url).toBe(400);
      }
    } finally {
      await db.site.update({ where: { id: "site-a" }, data: { gscProperty: "sc-domain:quilltab.app" } });
    }
  });

  it("refuses a url carrying a user name or password, before asking Google", async () => {
    stubGoogle();
    for (const url of ["https://user:pass@quilltab.app/", "https://user@quilltab.app/", "https://quilltab.app@example.com/"]) {
      const res = await inspect(url);
      expect(res.status, url).toBe(400);
      expect((await body(res)).error).toMatch(/user name or password/);
    }
    expect(calls).toEqual([]);
  });

  it("refuses a missing, relative or non-http url with 400, before asking Google", async () => {
    stubGoogle();
    for (const q of ["", "?url=", "?url=%2Fnotes", "?url=quilltab.app%2Fnotes", "?url=ftp%3A%2F%2Fquilltab.app%2F", "?url=javascript%3Aalert(1)"]) {
      const res = await get(`/sites/site-a/url-inspection${q}`);
      expect(res.status, q).toBe(400);
      expect((await body(res)).error).toMatch(/url/);
    }
    expect(calls).toEqual([]);
  });

  it("a site with no Search Console property answers 404 and says so", async () => {
    stubGoogle();
    await db.site.update({ where: { id: "site-a" }, data: { gscProperty: null } });
    try {
      const res = await inspect("https://quilltab.app/");
      expect(res.status).toBe(404);
      expect((await body(res)).error).toBe("This site has no Search Console property connected");
    } finally {
      await db.site.update({ where: { id: "site-a" }, data: { gscProperty: "sc-domain:quilltab.app" } });
    }
    expect(calls).toEqual([]);
  });

  it("maps Google's errors to statuses that do not read as a bad key or the key's rate limit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [google, status, message] of [
      [429, 503, /quota/],
      [403, 502, /no access to sc-domain:quilltab\.app/],
      [401, 409, /Reconnect Google/],
      [500, 502, /HTTP 500/],
    ] as const) {
      stubGoogle(google, { error: { code: google, message: "detail from Google", status: "X" } });
      const res = await inspect("https://quilltab.app/");
      expect(res.status, String(google)).toBe(status);
      const { error } = await body(res);
      expect(error).toMatch(message);
      expect(error).not.toContain("detail from Google");
    }
  });

  it("an expired Google connection (invalid_grant) asks to reconnect", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: "user-a" } });
    await db.user.update({ where: { id: "user-a" }, data: { googleTokens: { accessToken: "old", refreshToken: "revoked", expiresAt: 0 } } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })));
    try {
      const res = await inspect("https://quilltab.app/");
      expect(res.status).toBe(409);
      expect((await body(res)).error).toBe("The Google connection has expired. Reconnect Google in crawlseo.");
    } finally {
      await db.user.update({ where: { id: "user-a" }, data: { googleTokens: user.googleTokens ?? undefined } });
    }
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
