/**
 * Machine (service-to-service) surface: POST /api/svc/<tool>
 *
 * Mirrors the MCP tool set (mcp/tools.ts) over HTTP with JSON responses so
 * external scripts, dashboards, and automations can consume the same data
 * agents get via MCP — without a browser session. The web UI keeps NextAuth;
 * this surface authenticates with a static service token:
 *
 *   Authorization: Bearer <CRAWLSEO_SERVICE_TOKEN>
 *
 * Fail-closed: when CRAWLSEO_SERVICE_TOKEN is unset, every request is 401.
 * Instance-level scope (no per-user filtering) — same semantics as the MCP
 * server, which reads the whole instance.
 */
import { timingSafeEqual } from "crypto";

import { db } from "@/lib/db";
import {
  getSitePeriodMetrics,
  getTopKeywords,
  getTopPages,
  getDailyTraffic,
} from "@/lib/seo-metrics";
import { getAllOpportunities } from "@/lib/seo-opportunities";
import { runSiteCrawl } from "@/lib/crawler/engine";

// Bearer-token check. Fail-closed: with CRAWLSEO_SERVICE_TOKEN unset, every
// request is rejected (`expected.length > 0`), so an instance that never
// configures the token exposes nothing new. timingSafeEqual (after an equal-
// length guard, which it requires) avoids leaking the token via comparison
// timing.
function authorized(req: Request): boolean {
  const expected = process.env.CRAWLSEO_SERVICE_TOKEN || "";
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// Body-argument coercers: JSON bodies are untyped, so each handler pulls its
// arguments through these — `num` falls back to the tool's documented default,
// `str` returns null for anything but a non-empty string (callers turn that
// into a 400).
type Args = Record<string, unknown>;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

// One handler per MCP tool (same names as mcp/tools.ts), each running the
// same queries as the corresponding mcp/server.ts handler but returning raw
// data — formatting is the caller's job here, unlike the MCP server's
// text-formatted responses.
const handlers: Record<string, (args: Args) => Promise<unknown>> = {
  async list_sites() {
    return db.site.findMany({
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        createdAt: true,
        _count: { select: { crawls: true, keywords: true, pages: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async get_site_overview(args) {
    const siteId = str(args.siteId);
    if (!siteId) throw new SvcError(400, "siteId required");
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { id: true, domain: true, gscProperty: true },
    });
    if (!site) throw new SvcError(404, `site not found: ${siteId}`);
    const [metrics, latestCrawl, latestVitals] = await Promise.all([
      getSitePeriodMetrics(siteId, 28),
      db.crawl.findFirst({
        where: { siteId },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          status: true,
          healthScore: true,
          pagesFound: true,
          issuesFound: true,
          finishedAt: true,
        },
      }),
      db.vitalsReport.findFirst({ where: { siteId }, orderBy: { date: "desc" } }),
    ]);
    return { ...site, metrics, latestCrawl, latestVitals };
  },

  async get_keywords(args) {
    const siteId = str(args.siteId);
    if (!siteId) throw new SvcError(400, "siteId required");
    return getTopKeywords(siteId, num(args.days, 28), num(args.limit, 25));
  },

  async get_pages(args) {
    const siteId = str(args.siteId);
    if (!siteId) throw new SvcError(400, "siteId required");
    return getTopPages(siteId, num(args.days, 28), num(args.limit, 25));
  },

  async get_traffic(args) {
    const siteId = str(args.siteId);
    if (!siteId) throw new SvcError(400, "siteId required");
    return getDailyTraffic(siteId, num(args.days, 90));
  },

  async run_crawl(args) {
    const siteId = str(args.siteId);
    if (!siteId) throw new SvcError(400, "siteId required");
    const maxPages = num(args.maxPages, 200);
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { id: true, domain: true },
    });
    if (!site) throw new SvcError(404, `site not found: ${siteId}`);
    if (maxPages !== 200) {
      await db.crawl.updateMany({ where: { siteId, status: "PENDING" }, data: { maxPages } });
    }
    // Fire-and-forget, same as the MCP server's run_crawl: the crawl runs in
    // the background and the caller polls get_crawl_status. The short wait
    // gives runSiteCrawl a moment to create the crawl record so the response
    // can return its id.
    runSiteCrawl(siteId, site.domain).catch((err) => {
      console.error(`Crawl failed for site ${siteId}:`, err);
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    return db.crawl.findFirst({
      where: { siteId },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true },
    });
  },

  async get_crawl_status(args) {
    const crawlId = str(args.crawlId);
    if (!crawlId) throw new SvcError(400, "crawlId required");
    const crawl = await db.crawl.findUnique({
      where: { id: crawlId },
      select: {
        id: true,
        siteId: true,
        status: true,
        pagesFound: true,
        issuesFound: true,
        healthScore: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    if (!crawl) throw new SvcError(404, `crawl not found: ${crawlId}`);
    return crawl;
  },

  async get_crawl_issues(args) {
    const crawlId = str(args.crawlId);
    if (!crawlId) throw new SvcError(400, "crawlId required");
    const severity = str(args.severity);
    return db.crawlIssue.findMany({
      where: {
        crawlId,
        ...(severity ? { severity: severity.toUpperCase() as never } : {}),
      },
      take: num(args.limit, 50),
      orderBy: [{ severity: "asc" }, { type: "asc" }],
      select: { severity: true, type: true, url: true, message: true },
    });
  },

  async get_vitals(args) {
    const siteId = str(args.siteId);
    if (!siteId) throw new SvcError(400, "siteId required");
    return db.vitalsReport.findMany({
      where: { siteId },
      orderBy: { date: "desc" },
      take: num(args.limit, 10),
    });
  },

  async get_opportunities(args) {
    const siteId = str(args.siteId);
    if (!siteId) throw new SvcError(400, "siteId required");
    return getAllOpportunities(siteId);
  },
};

// Handlers throw SvcError to produce a specific HTTP status (400 bad args,
// 404 unknown site/crawl); anything else becomes an opaque 500 so internal
// error details never reach the wire.
class SvcError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * POST /api/svc/<tool> — body: JSON args for the tool (may be empty).
 * Responses: { data } on success, { error } with a meaningful status
 * otherwise. Flow: auth → resolve tool → parse body → dispatch.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tool: string }> }
) {
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tool } = await params;
  const handler = handlers[tool];
  if (!handler) {
    // List the valid tool names so a typo'd client can self-correct.
    return Response.json(
      { error: `unknown tool: ${tool}`, tools: Object.keys(handlers) },
      { status: 404 }
    );
  }
  // Empty body = no-arg tool (e.g. list_sites); anything present must parse.
  let args: Args = {};
  try {
    const body = await req.text();
    if (body) args = JSON.parse(body) as Args;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const data = await handler(args);
    return Response.json({ data });
  } catch (err) {
    if (err instanceof SvcError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(`svc/${tool} failed:`, err);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
