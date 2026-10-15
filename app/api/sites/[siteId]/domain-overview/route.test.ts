import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, db, domainOverview, backlinksOverview, getSitePeriodMetrics } = vi.hoisted(() => ({
  auth: vi.fn(),
  db: {
    site: { findUnique: vi.fn() },
    keyword: { groupBy: vi.fn() },
  },
  domainOverview: vi.fn(),
  backlinksOverview: vi.fn(),
  getSitePeriodMetrics: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/dataforseo/client", () => ({ domainOverview, backlinksOverview }));
vi.mock("@/lib/seo-metrics", () => ({ getSitePeriodMetrics }));

import { GET } from "./route";

const overview = {
  organicKeywords: 120, organicTraffic: 300, organicCost: 40,
  backlinks: 0, referringDomains: 0,
};
const backlinks = {
  totalBacklinks: 42, referringDomains: 12, referringIps: 10, dofollow: 30, nofollow: 12,
};
const metrics = {
  current: { clicks: 7, impressions: 80, avgPosition: 12 },
  previous: { clicks: 5, impressions: 60, avgPosition: 14 },
  deltas: { clicks: 2, impressions: 20, avgPosition: -2 },
};

function get(domain?: string) {
  const url = new URL("http://localhost/api/sites/site-1/domain-overview");
  if (domain !== undefined) url.searchParams.set("domain", domain);
  return GET(new Request(url), { params: Promise.resolve({ siteId: "site-1" }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ user: { id: "user-1" } });
  db.site.findUnique.mockResolvedValue({ userId: "user-1", domain: "own.example" });
  domainOverview.mockResolvedValue(overview);
  backlinksOverview.mockResolvedValue(backlinks);
  getSitePeriodMetrics.mockResolvedValue(metrics);
  db.keyword.groupBy.mockResolvedValue([{ query: "own keyword" }]);
});

describe("GET /api/sites/[siteId]/domain-overview", () => {
  it("still analyzes the stored site when no comparison domain is supplied", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: "dataforseo", domain: "own.example", overview, backlinks,
    });
    expect(domainOverview).toHaveBeenCalledWith("user-1", "own.example");
    expect(backlinksOverview).toHaveBeenCalledWith("user-1", "own.example");
  });

  // Reproduced in the live Compare form: entering another website returned
  // the owned site's domain and its backlink counts in both cards.
  it.each([
    ["competitor.com", "competitor.com"],
    [" https://www.Competitor.com/blog/?ref=test#about ", "competitor.com"],
    ["www.competitor.com/", "competitor.com"],
    ["https://shop.competitor.com/", "shop.competitor.com"],
  ])("analyzes the requested competitor %s", async (input, target) => {
    const response = await get(input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: "dataforseo", domain: target, overview, backlinks,
    });
    expect(domainOverview).toHaveBeenCalledWith("user-1", target);
    expect(backlinksOverview).toHaveBeenCalledWith("user-1", target);
    expect(getSitePeriodMetrics).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://own.example/"])("keeps the own-site GSC fallback for %s", async (domain) => {
    domainOverview.mockResolvedValue(null);
    const response = await get(domain);
    expect(await response.json()).toMatchObject({
      source: "gsc", domain: "own.example",
      overview: { organicKeywords: 1, organicTraffic: 7 }, metrics,
    });
    expect(getSitePeriodMetrics).toHaveBeenCalledWith("site-1", 28);
  });

  it.each([null, backlinks])("never substitutes own-site GSC data for a competitor with missing rankings", async (summary) => {
    domainOverview.mockResolvedValue(null);
    backlinksOverview.mockResolvedValue(summary);
    const response = await get("competitor.com");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: summary ? "dataforseo" : "none",
      domain: "competitor.com", overview: null, backlinks: summary,
    });
    expect(getSitePeriodMetrics).not.toHaveBeenCalled();
    expect(db.keyword.groupBy).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "https://", "not a domain"])("rejects invalid comparison input %j before querying providers", async (domain) => {
    const response = await get(domain);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid comparison domain" });
    expect(domainOverview).not.toHaveBeenCalled();
    expect(backlinksOverview).not.toHaveBeenCalled();
    expect(getSitePeriodMetrics).not.toHaveBeenCalled();
  });

  // Own site stored with www: typing the bare domain (or the www URL) is the
  // own site, looked up as stored, so the Search Console fallback still applies.
  it.each(["own-site.com", "www.own-site.com", "https://WWW.Own-Site.com/blog"])(
    "treats %s as the own site when the site is stored with www",
    async (domain) => {
      db.site.findUnique.mockResolvedValue({ userId: "user-1", domain: "www.own-site.com" });
      domainOverview.mockResolvedValue(null);
      const response = await get(domain);
      expect(await response.json()).toMatchObject({ source: "gsc", domain: "www.own-site.com", metrics });
      expect(domainOverview).toHaveBeenCalledWith("user-1", "www.own-site.com");
      expect(backlinksOverview).toHaveBeenCalledWith("user-1", "www.own-site.com");
      expect(getSitePeriodMetrics).toHaveBeenCalledWith("site-1", 28);
    }
  );

  it("does not apply the public-domain check to the own site", async () => {
    db.site.findUnique.mockResolvedValue({ userId: "user-1", domain: "staging.internal" });
    domainOverview.mockResolvedValue(null);
    const response = await get("https://staging.internal/");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: "gsc", domain: "staging.internal" });
  });

  it.each([
    "localhost",
    "http://localhost:3000/",
    "127.0.0.1",
    "https://10.0.0.5/admin",
    "[::1]",
    "http://[2606:4700::1111]/",
    "intranet",
    "printer.local",
    "shop.test",
    "nothing.invalid",
    "competitor.example",
    "db.internal",
    "app.localhost",
    "2130706433",
    "0x7f000001",
    "127.1",
    "user@localhost",
    "localhost.",
    "router.home.arpa",
    "hidden.onion",
    "nas.lan",
  ])("rejects %s with a plain message before calling DataForSEO", async (domain) => {
    const response = await get(domain);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/^Enter a public domain such as example\.com\./);
    expect(domainOverview).not.toHaveBeenCalled();
    expect(backlinksOverview).not.toHaveBeenCalled();
    expect(getSitePeriodMetrics).not.toHaveBeenCalled();
  });

  it("requires authentication before querying a competitor", async () => {
    auth.mockResolvedValue(null);
    expect((await get("competitor.com")).status).toBe(401);
    expect(db.site.findUnique).not.toHaveBeenCalled();
    expect(domainOverview).not.toHaveBeenCalled();
    expect(backlinksOverview).not.toHaveBeenCalled();
  });

  it.each([null, { userId: "other-user", domain: "other.example" }])("still requires ownership of the site", async (site) => {
    db.site.findUnique.mockResolvedValue(site);
    expect((await get("competitor.com")).status).toBe(404);
    expect(domainOverview).not.toHaveBeenCalled();
    expect(backlinksOverview).not.toHaveBeenCalled();
  });
});
