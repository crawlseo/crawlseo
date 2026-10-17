# CrawlSEO MCP Server

MCP (Model Context Protocol) server that exposes CrawlSEO's SEO tools over stdio transport. AI agents like Claude Code can query site metrics, run crawls, check vitals, and find SEO opportunities.

## Setup

### 1. Install tsx (if not already installed)

```bash
npm install -D tsx
```

### 2. Connect to Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "crawlseo": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "/path/to/crawlseo"
    }
  }
}
```

Replace `/path/to/crawlseo` with the absolute path to your project root.

### 3. Ensure DATABASE_URL is set

The server needs access to the same PostgreSQL database as the main app. Make sure your `.env` file contains `DATABASE_URL`.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_sites` | List all monitored sites with basic info |
| `get_site_overview` | Site KPIs, health score, latest crawl, and vitals |
| `get_keywords` | Top keywords by clicks with position and CTR |
| `get_pages` | Top pages by clicks with position and CTR |
| `get_traffic` | Daily clicks and impressions over time |
| `run_crawl` | Queue a site crawl; the crawlseo app or its worker runs it |
| `get_crawl_status` | Check crawl progress and results, by job ID or crawl ID |
| `get_crawl_issues` | List issues found during a crawl |
| `get_vitals` | Core Web Vitals reports (LCP, CLS, INP, TTFB) |
| `get_opportunities` | SEO opportunities: striking distance, low CTR, content decay, cannibalization |

## Running Manually

```bash
npx tsx mcp/server.ts
```

The server communicates over stdin/stdout using the MCP protocol. Logs go to stderr.
