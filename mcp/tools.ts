/**
 * MCP tool definitions for CrawlSEO.
 * Each tool has a name, description, and zod schema for input validation.
 */

import { z } from "zod";

export const tools = [
  {
    name: "list_sites",
    description:
      "List all monitored sites with their domains and basic info. No parameters required.",
    schema: {},
  },
  {
    name: "get_site_overview",
    description:
      "Get a comprehensive overview of a site including KPIs (clicks, impressions, position, CTR), health score from the latest crawl, and latest Core Web Vitals.",
    schema: {
      siteId: z.string().describe("The site ID to get overview for"),
    },
  },
  {
    name: "get_keywords",
    description:
      "Get top keywords for a site sorted by clicks. Returns query, clicks, impressions, average position, and CTR.",
    schema: {
      siteId: z.string().describe("The site ID"),
      limit: z.number().optional().default(25).describe("Max keywords to return (default 25)"),
      days: z.number().optional().default(28).describe("Lookback period in days (default 28)"),
    },
  },
  {
    name: "get_pages",
    description:
      "Get top pages for a site sorted by clicks. Returns URL, clicks, impressions, average position, and CTR.",
    schema: {
      siteId: z.string().describe("The site ID"),
      limit: z.number().optional().default(25).describe("Max pages to return (default 25)"),
      days: z.number().optional().default(28).describe("Lookback period in days (default 28)"),
    },
  },
  {
    name: "get_traffic",
    description:
      "Get daily traffic data (clicks and impressions) for a site over a given period.",
    schema: {
      siteId: z.string().describe("The site ID"),
      days: z.number().optional().default(90).describe("Lookback period in days (default 90)"),
    },
  },
  {
    name: "run_crawl",
    description:
      "Start a new site crawl. Returns the crawl ID immediately; the crawl runs in the background. Use get_crawl_status to check progress.",
    schema: {
      siteId: z.string().describe("The site ID to crawl"),
      maxPages: z.number().optional().default(200).describe("Maximum pages to crawl (default 200). The server caps it at its page ceiling (CRAWL_MAX_PAGES, default 2000)"),
    },
  },
  {
    name: "get_crawl_status",
    description:
      "Check the status of a crawl by its ID. Returns status (PENDING/RUNNING/COMPLETED/FAILED), pages found, issues found, and health score.",
    schema: {
      crawlId: z.string().describe("The crawl ID to check"),
    },
  },
  {
    name: "get_crawl_issues",
    description:
      "Get issues found during a crawl. Can be filtered by severity (CRITICAL, WARNING, INFO).",
    schema: {
      crawlId: z.string().describe("The crawl ID"),
      severity: z
        .string()
        .optional()
        .describe("Filter by severity: CRITICAL, WARNING, or INFO"),
      limit: z.number().optional().default(50).describe("Max issues to return (default 50)"),
    },
  },
  {
    name: "get_vitals",
    description:
      "Get Core Web Vitals reports for a site. Returns LCP, CLS, INP, TTFB, and performance score.",
    schema: {
      siteId: z.string().describe("The site ID"),
      limit: z.number().optional().default(10).describe("Max reports to return (default 10)"),
    },
  },
  {
    name: "get_opportunities",
    description:
      "Get SEO opportunities for a site: striking-distance keywords, low-CTR keywords, content decay, and keyword cannibalization.",
    schema: {
      siteId: z.string().describe("The site ID"),
    },
  },
] as const;
