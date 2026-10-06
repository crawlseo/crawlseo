#!/usr/bin/env node

/**
 * CrawlSEO MCP Server
 *
 * Exposes SEO tools over stdio transport so AI agents (Claude Code, etc.)
 * can query site metrics, crawl data, vitals, and opportunities.
 *
 * Run: npx tsx mcp/server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { db } from "../lib/db";
import {
  getSitePeriodMetrics,
  getTopKeywords,
  getTopPages,
  getDailyTraffic,
} from "../lib/seo-metrics";
import { getAllOpportunities } from "../lib/seo-opportunities";
import { recoverCrawlsOnStartup, recoverStaleCrawls } from "../lib/crawler/lifecycle";
import { version } from "../package.json";
import { listVisibleIssues } from "../lib/crawler/issue-filter";
import { crawlStatus, runCrawl } from "./crawl";
import type { IssueSeverity } from "@prisma/client";

import {
  formatSiteOverview,
  formatKeywords,
  formatPages,
  formatTraffic,
  formatCrawlIssues,
  formatVitals,
  formatOpportunities,
} from "./formatters";

const SEVERITIES: IssueSeverity[] = ["CRITICAL", "WARNING", "INFO"];

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "CrawlSEO",
  version, // the app version from package.json
});

// ---------------------------------------------------------------------------
// 1. list_sites
// ---------------------------------------------------------------------------

server.tool(
  "list_sites",
  "List all monitored sites with their domains and basic info.",
  {},
  async () => {
    const sites = await db.site.findMany({
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        createdAt: true,
        _count: { select: { crawls: true, keywords: true, pages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (sites.length === 0) {
      return { content: [{ type: "text", text: "No sites found." }] };
    }

    const lines = sites.map(
      (s) =>
        `${s.domain}  (id: ${s.id})` +
        `\n  GSC: ${s.gscProperty ?? "not connected"}` +
        `  |  Crawls: ${s._count.crawls}  |  Keywords: ${s._count.keywords}  |  Pages: ${s._count.pages}` +
        `\n  Created: ${s.createdAt.toISOString().slice(0, 10)}`
    );

    return {
      content: [{ type: "text", text: `${sites.length} site(s):\n\n${lines.join("\n\n")}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// 2. get_site_overview
// ---------------------------------------------------------------------------

server.tool(
  "get_site_overview",
  "Get a comprehensive overview of a site including KPIs, health score, and vitals.",
  { siteId: z.string().describe("The site ID to get overview for") },
  async ({ siteId }) => {
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { id: true, domain: true, gscProperty: true },
    });

    if (!site) {
      return { content: [{ type: "text", text: `Site not found: ${siteId}` }] };
    }

    // A crawl whose process died reads as FAILED, not RUNNING (#57).
    await recoverStaleCrawls(db, { siteId });

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
          error: true,
        },
      }),
      db.vitalsReport.findFirst({
        where: { siteId },
        orderBy: { date: "desc" },
      }),
    ]);

    const overview = { ...site, metrics, latestCrawl, latestVitals };
    return { content: [{ type: "text", text: formatSiteOverview(overview) }] };
  }
);

// ---------------------------------------------------------------------------
// 3. get_keywords
// ---------------------------------------------------------------------------

server.tool(
  "get_keywords",
  "Get top keywords for a site sorted by clicks.",
  {
    siteId: z.string().describe("The site ID"),
    limit: z.number().optional().default(25).describe("Max keywords to return (default 25)"),
    days: z.number().optional().default(28).describe("Lookback period in days (default 28)"),
  },
  async ({ siteId, limit, days }) => {
    const keywords = await getTopKeywords(siteId, days, limit);
    return { content: [{ type: "text", text: formatKeywords(keywords) }] };
  }
);

// ---------------------------------------------------------------------------
// 4. get_pages
// ---------------------------------------------------------------------------

server.tool(
  "get_pages",
  "Get top pages for a site sorted by clicks.",
  {
    siteId: z.string().describe("The site ID"),
    limit: z.number().optional().default(25).describe("Max pages to return (default 25)"),
    days: z.number().optional().default(28).describe("Lookback period in days (default 28)"),
  },
  async ({ siteId, limit, days }) => {
    const pages = await getTopPages(siteId, days, limit);
    return { content: [{ type: "text", text: formatPages(pages) }] };
  }
);

// ---------------------------------------------------------------------------
// 5. get_traffic
// ---------------------------------------------------------------------------

server.tool(
  "get_traffic",
  "Get daily traffic data (clicks and impressions) for a site.",
  {
    siteId: z.string().describe("The site ID"),
    days: z.number().optional().default(90).describe("Lookback period in days (default 90)"),
  },
  async ({ siteId, days }) => {
    const traffic = await getDailyTraffic(siteId, days);
    return { content: [{ type: "text", text: formatTraffic(traffic) }] };
  }
);

// ---------------------------------------------------------------------------
// 6. run_crawl
// ---------------------------------------------------------------------------

server.tool(
  "run_crawl",
  "Start a new site crawl. Returns the crawl ID immediately; the crawl runs in the background.",
  {
    siteId: z.string().describe("The site ID to crawl"),
    maxPages: z.number().optional().default(200).describe("Maximum pages to crawl (default 200)"),
  },
  async ({ siteId, maxPages }) => {
    return { content: [{ type: "text", text: await runCrawl(db, { siteId, maxPages }) }] };
  }
);

// ---------------------------------------------------------------------------
// 7. get_crawl_status
// ---------------------------------------------------------------------------

server.tool(
  "get_crawl_status",
  "Check the status of a crawl by its ID.",
  { crawlId: z.string().describe("The crawl ID to check") },
  async ({ crawlId }) => {
    return { content: [{ type: "text", text: await crawlStatus(db, crawlId) }] };
  }
);

// ---------------------------------------------------------------------------
// 8. get_crawl_issues
// ---------------------------------------------------------------------------

server.tool(
  "get_crawl_issues",
  "Get issues found during a crawl, optionally filtered by severity.",
  {
    crawlId: z.string().describe("The crawl ID"),
    severity: z
      .string()
      .optional()
      .describe("Filter by severity: CRITICAL, WARNING, or INFO"),
    limit: z.number().optional().default(50).describe("Max issues to return (default 50)"),
  },
  async ({ crawlId, severity, limit }) => {
    const wanted = severity?.toUpperCase();
    if (wanted && !SEVERITIES.includes(wanted as IssueSeverity)) {
      return {
        content: [{ type: "text", text: `Unknown severity "${severity}". Use CRITICAL, WARNING or INFO.` }],
        isError: true,
      };
    }

    // Visible issues only: the crawl summary and content score rows are bookkeeping.
    const issues = await listVisibleIssues(db, {
      crawlId,
      severity: wanted as IssueSeverity | undefined,
      limit,
    });

    return { content: [{ type: "text", text: formatCrawlIssues(issues) }] };
  }
);

// ---------------------------------------------------------------------------
// 9. get_vitals
// ---------------------------------------------------------------------------

server.tool(
  "get_vitals",
  "Get Core Web Vitals reports for a site.",
  {
    siteId: z.string().describe("The site ID"),
    limit: z.number().optional().default(10).describe("Max reports to return (default 10)"),
  },
  async ({ siteId, limit }) => {
    const vitals = await db.vitalsReport.findMany({
      where: { siteId },
      orderBy: { date: "desc" },
      take: limit,
    });

    return { content: [{ type: "text", text: formatVitals(vitals) }] };
  }
);

// ---------------------------------------------------------------------------
// 10. get_opportunities
// ---------------------------------------------------------------------------

server.tool(
  "get_opportunities",
  "Get SEO opportunities: striking-distance keywords, low-CTR keywords, content decay, and cannibalization.",
  { siteId: z.string().describe("The site ID") },
  async ({ siteId }) => {
    const opportunities = await getAllOpportunities(siteId);
    return { content: [{ type: "text", text: formatOpportunities(opportunities) }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CrawlSEO MCP server running on stdio");

  // Crawls left RUNNING by a process that is gone (#57). Not awaited: a slow
  // database must not hold up the server.
  void recoverCrawlsOnStartup(db);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
