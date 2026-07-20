# Show HN: CrawlSEO – Open-source SEO monitoring with an MCP server for AI agents

**URL:** https://github.com/crawlseo/crawlseo

I built CrawlSEO because I was paying €119/month for Ahrefs to check three things: my rankings, my traffic trend, and whether I had broken pages. Google Search Console already has most of this data for free — it just doesn't have a good dashboard or a crawler.

CrawlSEO is a self-hosted SEO dashboard that connects to your Google Search Console account and gives you:

- **Keyword & page analytics** — position, clicks, impressions, CTR with period comparison
- **Site crawler** — crawls up to 2,000 pages, finds broken links, missing meta tags, duplicate titles, slow pages, and 16 other issue types
- **Core Web Vitals** — LCP, CLS, INP tracked over time via PageSpeed Insights API
- **SEO opportunities** — striking distance keywords (pos 8-20), low CTR outliers, content decay detection, keyword cannibalization
- **Alerts** — traffic drops, position changes, new 404s via email/Slack/Telegram/webhook

The part I find most interesting: it ships with an MCP (Model Context Protocol) server with 10 tools. You add a JSON config to Claude Code or Cursor, and your AI agent can query your keyword rankings, run crawls, check vitals, and find opportunities — all through natural language.

No paid APIs required for core features. If you want keyword volume/difficulty data, you can bring your own DataForSEO key (BYOK) — but it's optional. Google Autocomplete suggestions work as a free fallback.

Stack: Next.js 16, TypeScript, PostgreSQL, Prisma, shadcn/ui, Tailwind CSS. Single `docker compose up` to deploy.

MIT licensed. Happy to answer questions about the architecture or the MCP integration.
