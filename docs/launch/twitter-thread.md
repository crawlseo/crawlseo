# Twitter/X Launch Thread

---

**Tweet 1 (hook)**

I built an open-source alternative to Ahrefs.

GSC analytics + site crawler + Core Web Vitals + MCP server — all in one self-hosted dashboard.

Free forever. MIT licensed.

GitHub: github.com/crawlseo/crawlseo

Here's what it does (thread) 🧵

<!-- Attach: docs/screenshots/dashboard.png -->

---

**Tweet 2 (the problem)**

SEO tools charge €119-139/month.

But most founders only need:
→ What keywords am I ranking for?
→ Did traffic go up or down?
→ Are there broken pages on my site?

Google gives you this data for free via Search Console. It just doesn't have a good dashboard.

CrawlSEO fixes that.

---

**Tweet 3 (crawler + vitals)**

Beyond GSC data, CrawlSEO crawls your site (up to 2,000 pages) and finds:

- Broken links
- Missing meta tags
- Duplicate titles
- Slow pages
- Missing alt text
- 16 issue types total

Plus Core Web Vitals monitoring — LCP, CLS, INP tracked over time.

<!-- Attach: docs/screenshots/audit.png -->

---

**Tweet 4 (MCP — the differentiator)**

The part I'm most excited about: CrawlSEO ships with an MCP server.

Connect it to Claude Code, and your AI agent can:
- Check your rankings
- Run site crawls
- Find SEO opportunities
- Get traffic reports

All from natural language. No dashboards needed.

<!-- Attach: docs/screenshots/mcp.png -->

---

**Tweet 5 (self-hosting)**

Self-hosting takes 2 minutes:

```
git clone github.com/crawlseo/crawlseo
cp .env.example .env.local
docker compose up
```

Just needs Google OAuth credentials (free).

Stack: Next.js, PostgreSQL, Prisma, Tailwind, shadcn/ui.

No paid APIs required. Your data stays on your server.

---

**Tweet 6 (CTA)**

CrawlSEO is MIT licensed and free forever.

If you run a side project and you're tired of paying for SEO tools — give it a try.

⭐ Star it: github.com/crawlseo/crawlseo

PRs welcome. Built by @brandsondigital.
