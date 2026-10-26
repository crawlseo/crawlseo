import type { Crawl, IssueSeverity } from "@prisma/client";
import { db } from "@/lib/db";
import { getVisibleIssues, listVisibleIssues } from "@/lib/crawler/issue-filter";
import { NOINDEX_PAGE } from "@/lib/crawler/page-stats";
import { getNoindexWarning } from "@/lib/crawler/noindex-warning";
import { INTERRUPTED_MESSAGE, staleCrawlWhere } from "@/lib/crawler/lifecycle";
import { getDailyTraffic, getSitePeriodMetrics, getTopKeywords, getTopPages } from "@/lib/seo-metrics";
import { getAllOpportunities } from "@/lib/seo-opportunities";
import { ApiError, enumParam, intParam, periodParam } from "./params";

/*
 * The read endpoints of /api/v1. Each one takes the user the key belongs to
 * and reads that user's data only; none of them writes anything.
 */

export type Site = { id: string; domain: string; gscProperty: string | null };

const SEVERITIES: readonly IssueSeverity[] = ["CRITICAL", "WARNING", "INFO"];
const DEVICES = ["MOBILE", "DESKTOP"] as const;

/** The user's site, or 404: someone else's site reads exactly like a missing one. */
export async function ownSite(userId: string, siteId: string): Promise<Site> {
  const site = await db.site.findFirst({
    where: { id: siteId, userId },
    select: { id: true, domain: true, gscProperty: true },
  });
  if (!site) throw new ApiError(404, "Site not found");
  return site;
}

type CrawlRow = Pick<Crawl, "id" | "status" | "startedAt" | "finishedAt" | "pagesFound" | "issuesFound" | "healthScore" | "error">;
const CRAWL_SELECT = {
  id: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  pagesFound: true,
  issuesFound: true,
  healthScore: true,
  error: true,
} as const;

/**
 * A crawl whose process is gone reads as FAILED, as the dashboard shows it
 * once it has marked it. Decided here without writing anything.
 */
async function withStaleAsFailed(crawls: CrawlRow[]): Promise<CrawlRow[]> {
  const active = crawls.filter((c) => c.status === "PENDING" || c.status === "RUNNING").map((c) => c.id);
  if (active.length === 0) return crawls;
  const stale = await db.crawl.findMany({ where: { id: { in: active }, ...staleCrawlWhere() }, select: { id: true } });
  const ids = new Set(stale.map((c) => c.id));
  return crawls.map((c) => (ids.has(c.id) ? { ...c, status: "FAILED", error: INTERRUPTED_MESSAGE } : c));
}

/** The key making the request, so a client can check its key without reading any data. */
export async function keyInfo(keyId: string) {
  const key = await db.accessKey.findUnique({ where: { id: keyId }, select: { name: true, prefix: true, createdAt: true } });
  if (!key) throw new ApiError(401, "Invalid API key");
  return { key };
}

export async function listSites(userId: string) {
  const sites = await db.site.findMany({
    where: { userId },
    select: {
      id: true,
      domain: true,
      gscProperty: true,
      createdAt: true,
      _count: { select: { crawls: true, vitals: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return {
    sites: sites.map(({ _count, ...s }) => ({ ...s, crawls: _count.crawls, vitalsReports: _count.vitals })),
  };
}

export async function siteOverview(site: Site) {
  const [metrics, latestCrawl, latestVitals] = await Promise.all([
    getSitePeriodMetrics(site.id, 28),
    db.crawl.findFirst({ where: { siteId: site.id }, orderBy: { startedAt: "desc" }, select: CRAWL_SELECT }),
    db.vitalsReport.findFirst({ where: { siteId: site.id }, orderBy: { date: "desc" } }),
  ]);
  return {
    site,
    metricsDays: 28,
    metrics,
    latestCrawl: latestCrawl ? (await withStaleAsFailed([latestCrawl]))[0] : null,
    latestVitals: latestVitals && vitalsView(latestVitals),
  };
}

export async function keywords(site: Site, params: URLSearchParams) {
  const { period, startDate, endDate } = periodParam(params, 28);
  const limit = intParam(params, "limit", 50, 1, 1000);
  return { site, startDate, endDate, keywords: await getTopKeywords(site.id, period, limit) };
}

export async function pages(site: Site, params: URLSearchParams) {
  const { period, startDate, endDate } = periodParam(params, 28);
  const limit = intParam(params, "limit", 50, 1, 1000);
  return { site, startDate, endDate, pages: await getTopPages(site.id, period, limit) };
}

export async function traffic(site: Site, params: URLSearchParams) {
  const { period, startDate, endDate } = periodParam(params, 90);
  return { site, startDate, endDate, days: await getDailyTraffic(site.id, period) };
}

export async function crawls(site: Site, params: URLSearchParams) {
  const limit = intParam(params, "limit", 10, 1, 100);
  const rows = await db.crawl.findMany({
    where: { siteId: site.id },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: CRAWL_SELECT,
  });
  return { site, crawls: await withStaleAsFailed(rows) };
}

/**
 * Issues of one crawl of the site; crawlId "latest" is the latest completed
 * crawl. noindex pages have no issues and do not count toward the health
 * score; `noindexPages` says how many the crawl kept out (#105).
 * `noindexWarning` is set when at least 80% of the fetched (2xx) pages are
 * noindex, so a clean score is not read as a healthy site; null otherwise.
 */
export async function crawlIssues(site: Site, crawlId: string, params: URLSearchParams) {
  const severity = enumParam(params, "severity", SEVERITIES);
  const limit = intParam(params, "limit", 50, 1, 500);
  const crawl = await db.crawl.findFirst({
    where: crawlId === "latest" ? { siteId: site.id, status: "COMPLETED" } : { id: crawlId, siteId: site.id },
    orderBy: { startedAt: "desc" },
    select: CRAWL_SELECT,
  });
  if (!crawl) throw new ApiError(404, crawlId === "latest" ? "This site has no completed crawl yet" : "Crawl not found");
  const [counts, issues, noindexPages, noindexWarning] = await Promise.all([
    getVisibleIssues(db, crawl.id, 0),
    listVisibleIssues(db, { crawlId: crawl.id, severity, limit }),
    db.auditPage.count({ where: { crawlId: crawl.id, ...NOINDEX_PAGE } }),
    getNoindexWarning(db, crawl.id),
  ]);
  return {
    site,
    crawl: (await withStaleAsFailed([crawl]))[0],
    total: counts.total,
    bySeverity: counts.bySeverity,
    noindexPages,
    noindexWarning,
    issues,
  };
}

type VitalsRow = {
  url: string;
  date: Date;
  device: string;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  fid: number | null;
  ttfb: number | null;
  perfScore: number | null;
  speedIndex: number | null;
};

function vitalsView(v: VitalsRow) {
  const { url, date, device, lcp, cls, inp, fid, ttfb, perfScore, speedIndex } = v;
  return { url, date, device, lcp, cls, inp, fid, ttfb, perfScore, speedIndex };
}

export async function vitals(site: Site, params: URLSearchParams) {
  const device = enumParam(params, "device", DEVICES);
  const limit = intParam(params, "limit", 10, 1, 100);
  const reports = await db.vitalsReport.findMany({
    where: { siteId: site.id, ...(device && { device }) },
    orderBy: { date: "desc" },
    take: limit,
  });
  return { site, reports: reports.map(vitalsView) };
}

export async function opportunities(site: Site) {
  return { site, ...(await getAllOpportunities(site.id)) };
}
