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
import { runSiteCrawl } from "../lib/crawler/engine";
import { listVisibleIssues } from "../lib/crawler/issue-filter";
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
  version: "1.0.0",
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
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { id: true, domain: true },
    });

    if (!site) {
      return { content: [{ type: "text", text: `Site not found: ${siteId}` }] };
    }

    // Update default max pages if specified
    if (maxPages && maxPages !== 200) {
      await db.crawl.updateMany({
        where: { siteId, status: "PENDING" },
        data: { maxPages },
      });
    }

    // Fire and forget — the crawl runs in the background
    const crawlPromise = runSiteCrawl(siteId, site.domain);
    crawlPromise.catch((err) => {
      console.error(`Crawl failed for site ${siteId}:`, err);
    });

    // Give it a moment to create the crawl record
    await new Promise((resolve) => setTimeout(resolve, 500));

    const crawl = await db.crawl.findFirst({
      where: { siteId },
      orderBy: { startedAt: "desc" },
      select: { id: true, status: true },
    });

    return {
      content: [
        {
          type: "text",
          text: crawl
            ? `Crawl started.\nCrawl ID: ${crawl.id}\nStatus: ${crawl.status}\n\nUse get_crawl_status to check progress.`
            : `Crawl initiated for ${site.domain}. Check back shortly.`,
        },
      ],
    };
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
    const crawl = await db.crawl.findUnique({
      where: { id: crawlId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        pagesFound: true,
        issuesFound: true,
        healthScore: true,
        maxPages: true,
      },
    });

    if (!crawl) {
      return { content: [{ type: "text", text: `Crawl not found: ${crawlId}` }] };
    }

    const lines = [
      `Crawl: ${crawl.id}`,
      `Status: ${crawl.status}`,
      `Pages found: ${crawl.pagesFound} / ${crawl.maxPages} max`,
      `Issues found: ${crawl.issuesFound}`,
      `Health score: ${crawl.healthScore ?? "pending"}/100`,
      `Started: ${crawl.startedAt?.toISOString().slice(0, 16) ?? "-"}`,
      `Finished: ${crawl.finishedAt?.toISOString().slice(0, 16) ?? "-"}`,
    ];

    return { content: [{ type: "text", text: lines.join("\n") }] };
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
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
