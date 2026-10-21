# @crawlseo/mcp

The MCP (Model Context Protocol) server for [crawlseo](https://github.com/crawlseo/crawlseo), the open-source SEO monitoring app. It lets an AI agent such as Claude Code read your sites' Search Console data, crawl issues, Core Web Vitals and SEO opportunities.

**Read-only.** Every tool reads through your crawlseo instance's API (`/api/v1`) with an access key, and only sends GET requests. No tool writes, queues or triggers anything: there is no tool to start a crawl or a sync. The server never connects to a database, and the key sees the sites of its own account only.

## Get a key

In crawlseo, open **Settings > MCP**, turn MCP on, and create a key. The key is shown once; copy it then. Revoke it there when you no longer need it.

## Claude Code

Over stdio, against your own instance:

```bash
claude mcp add crawlseo -e CRAWLSEO_URL=http://localhost:3000 -e CRAWLSEO_API_KEY=<key> -- npx -y @crawlseo/mcp
```

A crawlseo instance also serves MCP itself at `/mcp`, so you may not need this package at all:

```bash
claude mcp add --transport http crawlseo https://seo.example.com/mcp --header "Authorization: Bearer <key>"
```

## Environment

| Variable | Meaning |
|---|---|
| `CRAWLSEO_URL` | Your crawlseo instance (default `http://localhost:3000`) |
| `CRAWLSEO_API_KEY` | An access key from Settings > MCP (stdio mode) |

## HTTP mode

```bash
CRAWLSEO_URL=http://localhost:3000 npx -y @crawlseo/mcp --http --port 3333
```

Serves streamable HTTP on `http://127.0.0.1:3333/mcp` and a health check on `/health`. The server holds no key: each client sends its own as `Authorization: Bearer <key>`, and a request without a key, or with a key the instance refuses, gets 401 (403 while MCP is off for that account). `--host` changes the address it listens on (default `127.0.0.1`).

## Tools

| Tool | What it reads |
|---|---|
| `list_sites` | Your sites with their IDs and Search Console properties |
| `get_site_overview` | Clicks, impressions, position and CTR over 28 days against the 28 before, the latest crawl and vitals |
| `get_keywords` | Top Search Console queries, for the last N days or a date range |
| `get_pages` | Top pages, for the last N days or a date range |
| `get_traffic` | Daily clicks and impressions, for the last N days or a date range |
| `list_crawls` | The latest crawls with status, pages, issues and health score |
| `get_crawl_issues` | Issues of a crawl (the latest completed one by default), by severity |
| `get_vitals` | Core Web Vitals reports: performance score, LCP, CLS, INP, TTFB |
| `get_opportunities` | Striking distance, low CTR, content decay and cannibalization |

## License

MIT
