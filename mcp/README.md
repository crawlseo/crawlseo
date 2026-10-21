# CrawlSEO MCP Server

A read-only MCP (Model Context Protocol) server for crawlseo, over stdio. AI agents such as Claude Code can read your sites' Search Console data, crawl issues, Core Web Vitals and SEO opportunities.

The server reads through your crawlseo instance's API (`/api/v1`) with an access key, and only ever sends GET requests. It never connects to the database, and no tool writes, queues or triggers anything: there is no tool to start a crawl or a sync.

## Setup

The server needs two environment variables:

| Variable | Meaning |
|---|---|
| `CRAWLSEO_URL` | Your crawlseo instance, e.g. `http://localhost:3000` (the default) |
| `CRAWLSEO_API_KEY` | An access key of your crawlseo account. The key sees your own sites only |

Add it to your MCP client, for example in `.mcp.json`:

```json
{
  "mcpServers": {
    "crawlseo": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "/path/to/crawlseo",
      "env": { "CRAWLSEO_URL": "http://localhost:3000", "CRAWLSEO_API_KEY": "<key>" }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_sites` | Your sites with their IDs and Search Console properties |
| `get_site_overview` | Clicks, impressions, position and CTR over 28 days, the latest crawl and vitals |
| `get_keywords` | Top Search Console queries, for the last N days or a date range |
| `get_pages` | Top pages, for the last N days or a date range |
| `get_traffic` | Daily clicks and impressions, for the last N days or a date range |
| `list_crawls` | The latest crawls with status, pages, issues and health score |
| `get_crawl_issues` | Issues of a crawl (the latest completed one by default), by severity |
| `get_vitals` | Core Web Vitals reports (performance score, LCP, CLS, INP, TTFB) |
| `get_opportunities` | Striking distance, low CTR, content decay and cannibalization |

## Running manually

```bash
CRAWLSEO_URL=http://localhost:3000 CRAWLSEO_API_KEY=<key> npx tsx mcp/server.ts
```

The server communicates over stdin/stdout using the MCP protocol. Logs go to stderr.
