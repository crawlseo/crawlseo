/**
 * The crawlseo MCP tools. Every tool is read-only: it makes GET requests to
 * the instance's /api/v1 API with the user's access key, so it sees that
 * user's sites only, and nothing it does writes, queues or triggers anything.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { ApiRequestError, type ApiClient } from "./api-client";
import {
  formatBingKeywords,
  formatBingPages,
  formatBingTraffic,
  formatCrawlIssues,
  formatCrawls,
  formatKeywords,
  formatOpportunities,
  formatPages,
  formatSiteOverview,
  formatTraffic,
  formatVitals,
} from "./formatters";

type Period = { startDate: string; endDate: string };
type BingPeriod = Period & { bingSite: string };
type SearchRow = { clicks: number; impressions: number; position: number; ctr: number };
type Crawl = Parameters<typeof formatCrawls>[0][number];

/** Every tool only reads, and only from the user's own crawlseo instance. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const siteId = z.string().describe("The site ID, from list_sites");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const periodShape = {
  days: z.number().int().min(1).max(490).optional().describe("The last N days. Ignored when startDate and endDate are set"),
  startDate: date.optional().describe("First day, YYYY-MM-DD. Use with endDate"),
  endDate: date.optional().describe("Last day, YYYY-MM-DD, included. Use with startDate"),
};

/** The API takes either days or a date range. */
function periodQuery(p: { days?: number; startDate?: string; endDate?: string }) {
  return p.startDate || p.endDate ? { startDate: p.startDate, endDate: p.endDate } : { days: p.days };
}

function text(t: string): CallToolResult {
  return { content: [{ type: "text", text: t }] };
}

/** Runs a tool and turns an API refusal (bad key, unknown site, bad dates) into a tool error the agent can read. */
async function run(fn: () => Promise<string>): Promise<CallToolResult> {
  try {
    return text(await fn());
  } catch (err) {
    if (err instanceof ApiRequestError) return { ...text(err.message), isError: true };
    throw err;
  }
}

export const TOOL_NAMES = [
  "list_sites",
  "get_site_overview",
  "get_keywords",
  "get_pages",
  "get_traffic",
  "list_crawls",
  "get_crawl_issues",
  "get_vitals",
  "get_opportunities",
  "get_bing_traffic",
  "get_bing_keywords",
  "get_bing_pages",
] as const;

export function registerTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "list_sites",
    {
      title: "List sites",
      description: "List your monitored sites with their IDs, domains, Search Console and Bing Webmaster properties.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run(async () => {
        const { sites } = await api.get<{
          sites: {
            id: string;
            domain: string;
            gscProperty: string | null;
            bingSite?: string | null;
            createdAt: string;
            crawls: number;
            vitalsReports: number;
          }[];
        }>("/sites");
        if (sites.length === 0) return "No sites found.";
        const lines = sites.map(
          (s) =>
            `${s.domain}  (id: ${s.id})` +
            `\n  GSC: ${s.gscProperty ?? "not connected"}  |  Bing: ${s.bingSite ?? "not connected"}` +
            `\n  Crawls: ${s.crawls}  |  Vitals reports: ${s.vitalsReports}` +
            `\n  Added: ${s.createdAt.slice(0, 10)}`
        );
        return `${sites.length} site(s):\n\n${lines.join("\n\n")}`;
      })
  );

  server.registerTool(
    "get_site_overview",
    {
      title: "Site overview",
      description:
        "Overview of a site: clicks, impressions, average position and CTR over the last 28 days against the 28 days before, the latest crawl with its health score, and the latest Core Web Vitals.",
      inputSchema: { siteId },
      annotations: READ_ONLY,
    },
    ({ siteId }) =>
      run(async () => {
        const o = await api.get<{
          site: { id: string; domain: string; gscProperty: string | null };
          metricsDays: number;
          metrics: Parameters<typeof formatSiteOverview>[0]["metrics"];
          latestCrawl: Crawl | null;
          latestVitals: Parameters<typeof formatSiteOverview>[0]["latestVitals"];
        }>(`/sites/${encodeURIComponent(siteId)}`);
        return formatSiteOverview({ ...o.site, metricsDays: o.metricsDays, metrics: o.metrics, latestCrawl: o.latestCrawl, latestVitals: o.latestVitals });
      })
  );

  server.registerTool(
    "get_keywords",
    {
      title: "Search Console keywords",
      description:
        "Top Google Search Console queries for a site, by clicks: clicks, impressions, average position and CTR. Default period: the last 28 days.",
      inputSchema: {
        siteId,
        ...periodShape,
        limit: z.number().int().min(1).max(1000).optional().default(25).describe("Most keywords to return (default 25)"),
      },
      annotations: READ_ONLY,
    },
    ({ siteId, limit, ...p }) =>
      run(async () => {
        const r = await api.get<Period & { keywords: (SearchRow & { query: string })[] }>(
          `/sites/${encodeURIComponent(siteId)}/keywords`,
          { ...periodQuery(p), limit }
        );
        return formatKeywords(r.keywords, r);
      })
  );

  server.registerTool(
    "get_pages",
    {
      title: "Search Console pages",
      description:
        "Top pages of a site in Google Search Console, by clicks: clicks, impressions, average position and CTR. Default period: the last 28 days.",
      inputSchema: {
        siteId,
        ...periodShape,
        limit: z.number().int().min(1).max(1000).optional().default(25).describe("Most pages to return (default 25)"),
      },
      annotations: READ_ONLY,
    },
    ({ siteId, limit, ...p }) =>
      run(async () => {
        const r = await api.get<Period & { pages: (SearchRow & { url: string })[] }>(
          `/sites/${encodeURIComponent(siteId)}/pages`,
          { ...periodQuery(p), limit }
        );
        return formatPages(r.pages, r);
      })
  );

  server.registerTool(
    "get_traffic",
    {
      title: "Daily traffic",
      description: "Daily Search Console clicks and impressions for a site. Default period: the last 90 days.",
      inputSchema: { siteId, ...periodShape },
      annotations: READ_ONLY,
    },
    ({ siteId, ...p }) =>
      run(async () => {
        const r = await api.get<Period & { days: { date: string; clicks: number; impressions: number }[] }>(
          `/sites/${encodeURIComponent(siteId)}/traffic`,
          periodQuery(p)
        );
        return formatTraffic(r.days, r);
      })
  );

  server.registerTool(
    "list_crawls",
    {
      title: "List crawls",
      description: "The latest crawls of a site, newest first: status, pages, issues and health score. Crawls are started in crawlseo, not here.",
      inputSchema: {
        siteId,
        limit: z.number().int().min(1).max(100).optional().default(10).describe("Most crawls to return (default 10)"),
      },
      annotations: READ_ONLY,
    },
    ({ siteId, limit }) =>
      run(async () => {
        const r = await api.get<{ crawls: Crawl[] }>(`/sites/${encodeURIComponent(siteId)}/crawls`, { limit });
        return formatCrawls(r.crawls);
      })
  );

  server.registerTool(
    "get_crawl_issues",
    {
      title: "Crawl issues",
      description:
        "Issues a crawl found on a site (broken links, missing titles, slow pages and more), with counts per severity. noindex pages are crawled but have no issues and do not count toward the health score; the result says how many there were. Defaults to the latest completed crawl.",
      inputSchema: {
        siteId,
        crawlId: z.string().optional().describe("A crawl ID from list_crawls. Default: the latest completed crawl"),
        severity: z.enum(["CRITICAL", "WARNING", "INFO"]).optional().describe("Only this severity"),
        limit: z.number().int().min(1).max(500).optional().default(50).describe("Most issues to return (default 50)"),
      },
      annotations: READ_ONLY,
    },
    ({ siteId, crawlId, severity, limit }) =>
      run(async () => {
        const r = await api.get<Parameters<typeof formatCrawlIssues>[0]>(
          `/sites/${encodeURIComponent(siteId)}/crawls/${encodeURIComponent(crawlId || "latest")}/issues`,
          { severity, limit }
        );
        return formatCrawlIssues(r);
      })
  );

  server.registerTool(
    "get_vitals",
    {
      title: "Core Web Vitals",
      description: "Core Web Vitals reports for a site, newest first: performance score, LCP, CLS, INP and TTFB.",
      inputSchema: {
        siteId,
        device: z.enum(["MOBILE", "DESKTOP"]).optional().describe("Only this device"),
        limit: z.number().int().min(1).max(100).optional().default(10).describe("Most reports to return (default 10)"),
      },
      annotations: READ_ONLY,
    },
    ({ siteId, device, limit }) =>
      run(async () => {
        const r = await api.get<{ reports: Parameters<typeof formatVitals>[0] }>(
          `/sites/${encodeURIComponent(siteId)}/vitals`,
          { device, limit }
        );
        return formatVitals(r.reports);
      })
  );

  server.registerTool(
    "get_opportunities",
    {
      title: "SEO opportunities",
      description:
        "SEO opportunities for a site from its Search Console data: striking-distance keywords, low-CTR keywords, content decay and keyword cannibalization.",
      inputSchema: { siteId },
      annotations: READ_ONLY,
    },
    ({ siteId }) =>
      run(async () => {
        const r = await api.get<Parameters<typeof formatOpportunities>[0]>(`/sites/${encodeURIComponent(siteId)}/opportunities`);
        return formatOpportunities(r);
      })
  );

  server.registerTool(
    "get_bing_traffic",
    {
      title: "Bing daily traffic",
      description:
        "Daily Bing Webmaster Tools data for a site: clicks, impressions, pages crawled, and Bing's count of indexed pages and crawl errors on each day. For sites with a Bing property connected. Default period: the last 90 days.",
      inputSchema: { siteId, ...periodShape },
      annotations: READ_ONLY,
    },
    ({ siteId, ...p }) =>
      run(async () => {
        const r = await api.get<BingPeriod & { days: Parameters<typeof formatBingTraffic>[0] }>(
          `/sites/${encodeURIComponent(siteId)}/bing/traffic`,
          periodQuery(p)
        );
        return formatBingTraffic(r.days, r);
      })
  );

  server.registerTool(
    "get_bing_keywords",
    {
      title: "Bing keywords",
      description:
        "Top Bing search queries for a site, by clicks: clicks, impressions and average position, summed over the weeks that end in the period (Bing reports them by week). Bing often lists queries Search Console hides. Default period: the last 28 days.",
      inputSchema: {
        siteId,
        ...periodShape,
        limit: z.number().int().min(1).max(1000).optional().default(25).describe("Most keywords to return (default 25)"),
      },
      annotations: READ_ONLY,
    },
    ({ siteId, limit, ...p }) =>
      run(async () => {
        const r = await api.get<BingPeriod & { keywords: Parameters<typeof formatBingKeywords>[0] }>(
          `/sites/${encodeURIComponent(siteId)}/bing/keywords`,
          { ...periodQuery(p), limit }
        );
        return formatBingKeywords(r.keywords, r);
      })
  );

  server.registerTool(
    "get_bing_pages",
    {
      title: "Bing pages",
      description:
        "Top pages of a site in Bing, by clicks: clicks, impressions and average position, summed over the weeks that end in the period. Default period: the last 28 days.",
      inputSchema: {
        siteId,
        ...periodShape,
        limit: z.number().int().min(1).max(1000).optional().default(25).describe("Most pages to return (default 25)"),
      },
      annotations: READ_ONLY,
    },
    ({ siteId, limit, ...p }) =>
      run(async () => {
        const r = await api.get<BingPeriod & { pages: Parameters<typeof formatBingPages>[0] }>(
          `/sites/${encodeURIComponent(siteId)}/bing/pages`,
          { ...periodQuery(p), limit }
        );
        return formatBingPages(r.pages, r);
      })
  );
}

/** A crawlseo MCP server with every tool, reading through `api`. */
export function createMcpServer(api: ApiClient, version: string): McpServer {
  const server = new McpServer({ name: "crawlseo", version });
  registerTools(server, api);
  return server;
}
