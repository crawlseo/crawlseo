# Reddit Launch Posts

---

## r/selfhosted

**Title:** CrawlSEO — self-hosted SEO monitoring (GSC + site crawler + Core Web Vitals + MCP server)

**Body:**

I built an open-source SEO dashboard and wanted to share it here.

**What it does:**
- Connects to Google Search Console and syncs your keyword/page data
- Crawls your site (up to 2,000 pages) for broken links, missing meta tags, duplicate content, slow pages
- Monitors Core Web Vitals (LCP, CLS, INP) via PageSpeed Insights
- Detects SEO opportunities: striking distance keywords, low CTR, content decay
- Alerts via email, Slack, Telegram, or webhook
- MCP server with 10 tools so AI agents (Claude Code, Cursor) can query your data

**Stack:** Next.js 16, PostgreSQL, Prisma, shadcn/ui, Tailwind. Single Docker Compose stack.

**Self-hosting:**
```
git clone https://github.com/crawlseo/crawlseo.git
cd crawlseo
cp .env.example .env.local
docker compose up --build
```

You just need Google OAuth credentials (free). No paid APIs required for core features. Optional DataForSEO BYOK for keyword volume and backlink data.

MIT licensed. PRs welcome.

**GitHub:** https://github.com/crawlseo/crawlseo

Happy to answer any questions about the architecture or deployment.

---

## r/SideProject

**Title:** I built an open-source alternative to Ahrefs because €119/month felt insane for checking 3 things

**Body:**

I run a few side projects and I was paying for Ahrefs mostly to check:
- What keywords am I ranking for?
- Did traffic go up or down?
- Are there broken pages?

That's... not €119/month worth of value.

So I built **CrawlSEO** — a free, self-hosted SEO dashboard that does what I actually need:

- **GSC Analytics** — keywords, pages, clicks, position tracking
- **Site Crawler** — 2,000 pages, broken links, missing meta, health score
- **Core Web Vitals** — LCP, CLS, INP monitoring
- **SEO Opportunities** — finds striking distance keywords, low CTR pages, content decay
- **MCP Server** — 10 tools so Claude Code can query my SEO data from the terminal

The fun part: I can ask my AI agent "what keywords dropped this week?" and it answers using my actual data.

Stack: Next.js, PostgreSQL, Prisma, Tailwind. One `docker compose up` and it's running.

MIT licensed, free forever. If you want keyword volume data, you can bring your own DataForSEO key — but it's optional.

**GitHub:** https://github.com/crawlseo/crawlseo

Would love feedback on what features to prioritize next.

---

## r/opensource

**Title:** CrawlSEO — open-source, self-hosted SEO monitoring with MCP server for AI agents [MIT]

**Body:**

Releasing CrawlSEO, an open-source SEO monitoring dashboard.

**Core features:**
- Google Search Console data sync with keyword and page analytics
- Site crawler (2,000 pages, concurrent fetching, 16 issue types)
- Core Web Vitals monitoring (PageSpeed Insights)
- SEO opportunity detection (striking distance, low CTR, content decay, cannibalization)
- Alert system (email, Slack, Telegram, webhook)
- MCP server with 10 tools for AI agent integration

**Tech:** Next.js 16, TypeScript, PostgreSQL, Prisma, shadcn/ui, Tailwind CSS v4, Recharts

**What makes it different:** Besides being free and self-hosted, it ships with an MCP (Model Context Protocol) server. You connect it to Claude Code or Cursor, and your AI agent can query keywords, run crawls, check vitals — all through natural language.

Optional DataForSEO BYOK integration for keyword research and backlink analysis. Google Autocomplete as a free fallback.

**License:** MIT

**GitHub:** https://github.com/crawlseo/crawlseo

Contributions welcome — issues, PRs, feedback all appreciated. The codebase is straightforward Next.js App Router with Prisma.
