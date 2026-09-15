# OpenSEO vs CrawlSEO — Research & Comparison

> Research date: 2026-07-20
> Source: https://github.com/every-app/open-seo

---

## 1. Tech Stack Comparison

| Area | CrawlSEO | OpenSEO |
|------|----------|---------|
| Framework | Next.js 16 (App Router) | TanStack Start + Vite 7 |
| React | React 19 | React 19 |
| Runtime | Node.js (serverless) | Cloudflare Workers |
| Database | PostgreSQL via Prisma | D1 (SQLite) + Postgres via Drizzle ORM |
| Auth | NextAuth.js 5 beta | Better Auth |
| UI Library | shadcn/ui + Tailwind 4 | DaisyUI v5 + Tailwind 4 |
| Charts | Recharts | Recharts |
| Icons | Lucide React | Lucide React |
| SEO Data Source | Google Search Console API only | DataForSEO API (keywords, SERP, backlinks, domain analysis) + GSC |
| AI/Chat | None | Vercel AI SDK + OpenRouter + Cloudflare AI |
| MCP Server | None | Full OAuth2 MCP server (24 tools) |
| Billing | None | Autumn.js |
| Analytics | None | PostHog |
| Validation | None (manual) | Zod v4 |

**Takeaway:** OpenSEO has a significantly broader tech surface. The most impactful gaps for us are MCP integration, AI features, and the DataForSEO API as a data source beyond GSC.

---

## 2. MCP Integration

### OpenSEO's Approach

OpenSEO exposes a full MCP server so AI agents (Claude Code, etc.) can invoke SEO tools directly. This is a standout feature.

**Architecture:**
- Uses `@modelcontextprotocol/sdk` v1.29.0
- OAuth2 provider via `@cloudflare/workers-oauth-provider` for hosted mode
- Self-hosted mode supports Cloudflare Access or local no-auth
- POST-only transport (no SSE) to stay within Workers' 128MB memory limit

**24 MCP Tools:**

| Category | Tools |
|----------|-------|
| Account | `whoami` |
| Projects | `list_projects` |
| Keywords | `research_keywords`, `save_keywords`, `list_saved_keywords` |
| Domain | `get_domain_overview`, `get_domain_keyword_suggestions` |
| Backlinks | `get_backlinks_overview`, `get_backlinks_profile` |
| SERP | `get_serp_results` + local variants |
| Rank Tracking | `get_rank_tracker` + ranked keywords |
| GSC | `get_search_console_performance`, `inspect_urls` |
| Site Audit | `run_site_audit`, `get_audit_status`, `get_audit_issues`, `get_audit_pages` |
| Research | Google Ads tools, market research |

**Key details:**
- Structured output schemas per tool for type-safe responses
- Custom formatters output text tables optimized for LLM consumption
- PostHog instrumentation on every tool handler
- Dynamic client registration (for Claude Code auto-setup)
- Access tokens: 24h TTL; refresh tokens: 30 days

### CrawlSEO Status

No MCP integration exists. This is the single biggest feature gap.

### Recommendation

Build an MCP server exposing our existing capabilities:
- `list_sites`, `get_site_overview`
- `get_keywords`, `get_pages`, `get_traffic`
- `run_crawl`, `get_crawl_status`, `get_crawl_issues`
- `get_vitals`, `get_opportunities`
- `get_alerts`, `evaluate_alerts`

This would make CrawlSEO AI-agent-accessible immediately. Start with a simpler stdio transport (no OAuth needed for self-hosted) and add remote OAuth later.

---

## 3. UI & Dashboard Design

### OpenSEO

- **Layout:** Collapsible sidebar + content area. Project selector in sidebar with localStorage persistence.
- **Dashboard:** Onboarding checklist (4 steps: domain, MCP, GSC, competitors) + data cards in 2-col grid (MCP connect, GSC status, Audit health, Backlink pulse). Cards sorted data-first.
- **Pages:** Keywords, Saved Keywords, Domain Overview, Backlinks, Search Performance, Audit (launch + results), Rank Tracking, Settings, AI Prompt Explorer, SAM (AI assistant), Brand Lookup.
- **Design:** DaisyUI class-based components. Less custom CSS, more utility-first.
- **Notable UX:** GSC re-engagement modal nudges users who haven't connected. SEO API key banner when DataForSEO key is missing.

### CrawlSEO

- **Layout:** Dual sidebar (icon rail + nav panel) with dark theme and theme toggle.
- **Dashboard:** Portfolio overview with KPI cards (clicks, impressions, avg position, keywords) + traffic chart + top keywords.
- **Pages:** Sites list, Site overview, Keywords, Pages, Crawl, Vitals, Opportunities, Alerts.
- **Design:** shadcn/ui components + custom design tokens. More polished dark UI.
- **Notable UX:** Position badges (top3/top10/top20), delta indicators on KPIs, empty states with actions.

### Feature Gaps in CrawlSEO

| Feature | OpenSEO | CrawlSEO |
|---------|---------|----------|
| Onboarding flow | Guided 4-step checklist | None (straight to empty dashboard) |
| AI Chat/Assistant | SAM chat agent + Prompt Explorer | None |
| Backlink analysis | Full backlink profile + overview | None |
| Rank tracking | Dedicated rank tracker with history | Position shown in keywords table only |
| Domain/competitor analysis | Domain overview + competitor lookup | None |
| Saved keywords | Dedicated saved keywords list | None |
| Brand lookup | Entity/brand lookup page | None |
| CSV export | Via PapaParse | Endpoint exists but no UI |
| Search tabs | Unified search across features | None |

### Recommendations

1. **Add onboarding checklist** — Guide new users through setup (add site, connect GSC, first sync, first crawl). Reduces drop-off.
2. **Add CSV export UI** — We have the endpoint (`/api/sites/[siteId]/export`) but no button in the UI.
3. **Consider backlink tracking** — OpenSEO uses DataForSEO for this. We could integrate a free/cheaper API or allow users to provide their own DataForSEO key.

---

## 4. GSC Integration Comparison

### OpenSEO

- Uses Better Auth with Google OAuth, provider ID `"google-search-console"`
- Dedicated `gscConnections` table mapping GSC property to project (one connection per project)
- `buildSearchAnalyticsRequest()` wraps filters into `dimensionFilterGroups` (GSC silently ignores top-level `filters`)
- Caps at 1,000 rows per request (for LLM context windows)
- Accounts for ~2-3 day GSC data lag
- MCP tools: `get_search_console_performance` (with filters, dimensions, pagination) + `inspect_urls` (batch up to 10 URLs)
- Self-hosted OAuth variant for Docker deployments

### CrawlSEO

- NextAuth.js 5 with Google provider; tokens stored in `User.googleTokens` JSON
- `fetchSearchAnalytics()` supports dimensions: query, page, date, device, country
- Pagination: 25,000 rows per API call (more aggressive than OpenSEO)
- `syncGSCDataForSite()` upserts keywords + pages with date normalization
- URL Inspection API integration
- Period comparison (current vs previous) with delta calculation
- Impression-weighted average position

### What OpenSEO Does Better

1. **Filter support in queries** — OpenSEO builds proper `dimensionFilterGroups` with operators (equals, notEquals, contains, notContains). CrawlSEO fetches all data and filters client-side.
2. **Separate GSC connections table** — Cleaner separation between auth and site-to-property mapping. CrawlSEO stores `gscProperty` directly on the `Site` model.
3. **Data lag awareness** — OpenSEO explicitly accounts for GSC's 2-3 day data delay.

### What CrawlSEO Does Better

1. **Higher pagination limit** — 25k rows vs 1k means more complete data pulls.
2. **Period comparison built-in** — `getSitePeriodMetrics()` with automatic delta calculation.
3. **Opportunity detection** — Striking distance, low CTR, content decay, cannibalization analysis built on GSC data. OpenSEO doesn't have this.

### Recommendations

1. **Add server-side GSC query filters** — Use `dimensionFilterGroups` in API calls to reduce data transfer and enable filtered views.
2. **Account for data lag** — Show "data as of 2-3 days ago" indicator in the UI.

---

## 5. Site Audit / Crawler Comparison

### OpenSEO

- **Runtime:** Cloudflare Workflow (durable, retryable steps)
- **Scale:** Default 50 pages, max 10,000
- **Algorithm:** BFS with two priority queues (link-discovered + sitemap-only URLs)
- **Concurrency:** Batches of 25 concurrent fetches
- **robots.txt:** Respects via `robots-parser` library
- **Lighthouse:** Optional Lighthouse runs per page (mobile + desktop), stored in R2
- **Duplicate detection:** SHA-256 content hashing
- **Link graph:** `auditLinks` table stores edges (source, target, anchor text, isInternal, isNofollow)
- **Heading analysis:** Full h1-h6 counts with order JSON
- **Image analysis:** Total images, missing alt count, detail JSON
- **Structured data:** Detection flag
- **hreflang:** Tag capture
- **Content hash:** For duplicate page detection
- **Response time:** Per-page measurement
- **State management:** KV for crawl frontier state, D1 for results, keeps durable step state under 1MB
- **MCP tools:** `run_site_audit`, `get_audit_status`, `get_audit_issues` (with remediation), `get_audit_pages`

**5 database tables:** `audits`, `auditPages`, `auditLinks`, `auditIssues`, `auditLighthouseResults`

### CrawlSEO

- **Runtime:** In-process (serverless function, constrained by timeout)
- **Scale:** Max 40 pages (serverless time limit)
- **Algorithm:** BFS, follows internal links from domain root
- **Concurrency:** Sequential page fetches
- **robots.txt:** Fetches and checks, but no library (manual parsing)
- **Lighthouse:** No (uses PageSpeed Insights API separately in Vitals feature)
- **Duplicate detection:** Title/description string matching (exact duplicates only)
- **Link graph:** Not stored, only used during crawl for orphan detection
- **Content score:** Custom 0-100 algorithm (title length, description, H1 count, word count, schema, canonical)

**16 issue types** checked (listed in exploration report above)

**2 database tables:** `Crawl`, `CrawlIssue`

### What OpenSEO Does Better

1. **Scale** — 10,000 pages vs 40 pages. Not even close.
2. **Durability** — Cloudflare Workflows survive timeouts/crashes. Our in-process crawl fails if the serverless function times out.
3. **Rich page data** — Heading hierarchy, image details, link graph, hreflang, structured data flags, content hashes, response times all stored per page.
4. **Lighthouse integration** — Built into the audit workflow, not a separate feature.
5. **Link graph storage** — Source/target/anchor text enables broken link attribution, internal link analysis, PageRank-style metrics.
6. **Remediation guidance** — `get_audit_issues` includes `how_to_fix` text per issue type.
7. **Concurrency** — 25 parallel fetches vs sequential.

### What CrawlSEO Does Better

1. **Content score** — 0-100 scoring algorithm per page. OpenSEO doesn't have this.
2. **Orphan detection** — Identifies pages not linked from any other crawled page.
3. **Sitemap coverage** — Detects pages missing from sitemap.
4. **Mixed content detection** — HTTP resources on HTTPS pages.
5. **Health score** — Weighted aggregate score (critical -8, warning -3, info -1).

### Recommendations (Priority Order)

1. **Increase crawl limit** — Move crawler to a background job (Bull/BullMQ with Redis, or a long-running process) to support 500+ pages.
2. **Add concurrent fetching** — Batch 10-25 parallel requests. Single biggest performance win.
3. **Store per-page data** — Add an `AuditPage` table with title, description, h1, word count, images, response time, canonical, etc. Currently only issues are stored.
4. **Store link graph** — Add an `AuditLink` table (source, target, anchor, isInternal). Enables internal link analysis and better broken link reporting.
5. **Add content hashing** — SHA-256 of page body for true duplicate detection (not just title matching).
6. **Add remediation text** — Include "how to fix" guidance per issue type.
7. **Use `robots-parser` library** — Replace manual robots.txt parsing.

---

## 6. Features OpenSEO Has That We Should Consider

### High Priority (Core Differentiators)

| Feature | Why It Matters | Effort |
|---------|---------------|--------|
| **MCP Server** | AI-agent accessibility is a killer feature for developer SEO tools. Claude Code users can query their SEO data without leaving the terminal. | Medium |
| **Larger crawl scale** | 40-page limit is too small for real sites. Need 500+ minimum. | Medium |
| **Concurrent crawl fetches** | 25x speedup for crawls. | Low |
| **Per-page audit data storage** | Enables page-level analysis, comparison between crawls, and richer reporting. | Medium |

### Medium Priority (Valuable Additions)

| Feature | Why It Matters | Effort |
|---------|---------------|--------|
| **Onboarding checklist** | Reduces new user confusion and drop-off. | Low |
| **Link graph storage** | Enables internal link analysis, anchor text reports, PageRank estimation. | Medium |
| **Backlink analysis** | Competitive SEO requires backlink data. Would need DataForSEO or similar API. | Medium-High |
| **AI chat assistant** | Natural language SEO Q&A over user's data. | High |
| **Rank tracking** | Dedicated rank tracking with history, not just point-in-time keyword data. | Medium |
| **GSC query filters** | Server-side filtering reduces data transfer and enables power-user workflows. | Low |

### Low Priority (Nice-to-Have)

| Feature | Why It Matters | Effort |
|---------|---------------|--------|
| **Keyword research** | OpenSEO uses DataForSEO for this. Requires paid API. | Medium |
| **Domain competitor analysis** | Useful but requires paid API. | Medium |
| **Brand/entity lookup** | Niche feature. | Low |
| **Prompt explorer** | Meta-tool for testing AI prompts against SEO data. | Medium |
| **Billing/subscriptions** | Only needed if we go SaaS. | High |

---

## 7. Architecture Lessons from OpenSEO

### Things They Got Right

1. **Dual-database support with schema parity tests** — SQLite for edge/dev, Postgres for production. A `schema-parity.test.ts` ensures both stay in sync. Elegant approach if we ever want to support SQLite for easier self-hosting.

2. **Feature module organization** — Both client and server code organized by feature (`features/audit/`, `features/gsc/`, etc.) rather than by layer. Makes it easy to understand and modify a complete feature.

3. **MCP formatters for LLM consumption** — Tool responses are formatted as structured text tables optimized for token efficiency. Not raw JSON dumps.

4. **Separation of GSC connection from site** — A dedicated `gscConnections` table instead of a nullable field on `Site`. Cleaner for multi-property scenarios.

5. **Structured output schemas for MCP tools** — Type-safe tool responses, not just string blobs.

### Things We Do Better

1. **SEO opportunity detection** — Our striking distance, low CTR, content decay, and cannibalization analysis is unique. OpenSEO doesn't have equivalent analysis.

2. **Content scoring** — Per-page quality score with clear criteria. Actionable and easy to understand.

3. **Alert system** — Rule-based alerts with configurable thresholds. OpenSEO doesn't have alerting.

4. **Health score** — Weighted crawl health metric. Simple but effective.

5. **Docker-first self-hosting** — Our Docker setup is simpler (just Postgres + Next.js). OpenSEO's Cloudflare-native architecture makes self-hosting harder despite offering a Dockerfile.

---

## 8. Recommended Roadmap

### Phase A — Quick Wins (1-2 weeks)

- [ ] Add concurrent fetching to crawler (batch of 10-15)
- [ ] Increase crawl page limit to 200+
- [ ] Add onboarding checklist to dashboard
- [ ] Add CSV export button to Keywords and Pages tables
- [ ] Add GSC data lag indicator in UI
- [ ] Add server-side GSC query filters

### Phase B — Crawler Upgrade (2-3 weeks)

- [ ] Move crawler to background job (not in-request)
- [ ] Add `AuditPage` model for per-page data storage
- [ ] Add `AuditLink` model for link graph
- [ ] Add content hashing (SHA-256) for duplicate detection
- [ ] Add remediation guidance per issue type
- [ ] Use `robots-parser` library
- [ ] Support crawl of 1,000+ pages

### Phase C — MCP Server (2-3 weeks)

- [ ] Build MCP server with stdio transport
- [ ] Expose core tools: sites, keywords, pages, crawl, vitals, opportunities
- [ ] Add structured output schemas
- [ ] Add LLM-optimized formatters
- [ ] Document MCP setup for Claude Code users

### Phase D — Advanced Features (4+ weeks)

- [ ] Rank tracking with historical comparison
- [ ] Backlink analysis (via DataForSEO or similar)
- [ ] AI chat assistant for SEO Q&A
- [ ] Domain/competitor analysis
- [ ] Lighthouse integration in crawler

---

## 9. Key Files in OpenSEO (Reference)

| Area | Path |
|------|------|
| MCP Server | `src/server/mcp/server.ts`, `transport.ts` |
| MCP Tools | `src/server/mcp/tools/*.ts` |
| MCP OAuth | `src/server/mcp/oauth-provider.ts` |
| MCP Formatters | `src/server/mcp/formatters.ts`, `table.ts` |
| Crawler Workflow | `src/server/workflows/SiteAuditWorkflow.ts` |
| Crawl Logic | `src/server/workflows/siteAuditWorkflowCrawl.ts` |
| Crawl Phases | `src/server/workflows/siteAuditWorkflowPhases.ts` |
| Audit Schema | `src/db/audit.schema.ts` |
| GSC Integration | `src/server/features/gsc/` |
| GSC Search Analytics | `src/server/features/gsc/searchAnalytics.ts` |
| Dashboard | `src/client/features/dashboard/DashboardPage.tsx` |
| App Shell | `src/client/layout/AppShell.tsx` |
| Navigation | `src/client/navigation/` |
| AI Chat | `src/client/features/sam/` |
