# CrawlSEO — Product Requirements Document

## For Claude Code Development

---

## Overview

CrawlSEO is an open-source, self-hosted SEO monitoring tool that combines Google Search Console data, site crawling, and Core Web Vitals in one dashboard. It is the first open-source tool to unify all three free Google data sources in a single self-hosted web application.

**One-liner:** Open-source alternative to $140/mo SEO tools. GSC data + site crawler + Core Web Vitals in one dashboard.

**Repository:** github.com/crawlseo/crawlseo
**Domain:** crawlseo.dev or crawlseo.pro
**License:** MIT
**Author:** Mike / Brandson Digital

---

## Target User

Founders, freelancers, and small studio owners who have 2-10 websites. They are technically capable (many are vibe-coders who use Claude Code, Cursor, etc.) but they are not SEO specialists. They want to understand what's happening with their sites without paying $140-500/month for Ahrefs/Semrush.

**User persona:**
- Runs a design studio or indie SaaS
- Has 2-5 websites (studio site, personal site, side projects)
- Checks GSC maybe once a month, understands nothing
- Knows Docker, can run `docker compose up`
- Would never pay $139/mo for Semrush but would self-host a free tool
- Wants alerts when something breaks, not manual checking

---

## Tech Stack

Based on what works for Umami (35k stars), SerpBear (1.9k stars), and Cal.com (33k stars):

### Core

| Layer | Technology | Reason |
|-------|-----------|--------|
| Framework | Next.js 14+ (App Router) | Full-stack, SSR, API routes, proven at scale |
| Language | TypeScript | Type safety, Prisma integration, industry standard |
| Database | PostgreSQL | Universal, handles analytics queries at moderate scale |
| ORM | Prisma | Best TypeScript ORM, migrations, type generation |
| Auth | NextAuth.js (Auth.js) | Google OAuth built-in, reuse for GSC API access |
| Styling | Tailwind CSS | Utility-first, fast development |
| UI Components | shadcn/ui | Copy-paste components, no dependency lock-in |
| Charts | Recharts | React-native charts, simple API |
| Deployment | Docker Compose | 2 services: app + postgres. Industry standard for self-hosted |

### Background Jobs

| Component | Technology | Reason |
|-----------|-----------|--------|
| Job Queue | BullMQ + Redis | OR node-cron for simplicity in v1 |
| Scheduler | Built-in cron | Daily GSC sync, weekly crawl, hourly alerts check |

### External APIs (all free)

| API | Purpose | Rate Limit | Cost |
|-----|---------|-----------|------|
| Google Search Console API | Keywords, positions, clicks, impressions, CTR, pages | 1,200 QPM per site | $0 |
| Google URL Inspection API | Index status per URL | 2,000/day per site | $0 |
| PageSpeed Insights API | Core Web Vitals, performance score | 25,000/day | $0 |

---

## Project Structure

Monorepo, following Umami's pattern:

```
crawlseo/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Login, OAuth callback
│   │   ├── (dashboard)/        # Main dashboard pages
│   │   │   ├── page.tsx        # Overview dashboard
│   │   │   ├── sites/          # Site list, add site
│   │   │   ├── keywords/       # Keywords table, trends
│   │   │   ├── crawl/          # Crawl results, issues
│   │   │   ├── vitals/         # Core Web Vitals
│   │   │   └── settings/       # User settings, API keys
│   │   └── api/                # API routes
│   │       ├── auth/           # NextAuth endpoints
│   │       ├── sites/          # CRUD sites
│   │       ├── gsc/            # GSC data fetching
│   │       ├── crawl/          # Trigger crawl, get results
│   │       ├── vitals/         # PageSpeed data
│   │       └── alerts/         # Alert configuration
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── dashboard/          # Dashboard-specific components
│   │   ├── charts/             # Chart components
│   │   └── layout/             # Header, sidebar, footer
│   ├── lib/
│   │   ├── google/             # GSC API client, OAuth helpers
│   │   ├── crawler/            # Site crawler engine
│   │   ├── pagespeed/          # PageSpeed API client
│   │   ├── alerts/             # Alert logic (email, telegram, webhook)
│   │   ├── db.ts               # Prisma client
│   │   └── utils.ts            # Shared utilities
│   └── workers/
│       ├── gsc-sync.ts         # Background: daily GSC data pull
│       ├── crawl.ts            # Background: site crawling
│       ├── vitals.ts           # Background: PageSpeed checks
│       └── alerts.ts           # Background: alert evaluation
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # Auto-generated migrations
├── docker-compose.yml          # App + PostgreSQL
├── .env.example                # Template with all env vars
├── Dockerfile                  # Multi-stage build
├── README.md                   # Marketing + quick start
└── package.json
```

---

## Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============ AUTH ============

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  googleTokens  Json?     // Encrypted GSC OAuth tokens
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sites         Site[]
  alerts        Alert[]
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// ============ SITES ============

model Site {
  id          String   @id @default(cuid())
  userId      String
  domain      String   // e.g. "brandson.digital"
  gscProperty String?  // e.g. "sc-domain:brandson.digital"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  keywords    Keyword[]
  pages       Page[]
  crawls      Crawl[]
  vitals      VitalsReport[]
  alerts      Alert[]
  
  @@unique([userId, domain])
}

// ============ GSC DATA ============

model Keyword {
  id          String   @id @default(cuid())
  siteId      String
  query       String   // The search query
  date        DateTime // Date of the data point
  clicks      Int      @default(0)
  impressions Int      @default(0)
  ctr         Float    @default(0)
  position    Float    @default(0)
  page        String?  // Landing page URL
  device      String?  // DESKTOP, MOBILE, TABLET
  country     String?  // Country code
  
  site        Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  
  @@index([siteId, date])
  @@index([siteId, query, date])
}

model Page {
  id          String   @id @default(cuid())
  siteId      String
  url         String
  date        DateTime
  clicks      Int      @default(0)
  impressions Int      @default(0)
  ctr         Float    @default(0)
  position    Float    @default(0)
  
  site        Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  
  @@index([siteId, date])
  @@index([siteId, url, date])
}

// ============ CRAWLER ============

model Crawl {
  id          String     @id @default(cuid())
  siteId      String
  status      CrawlStatus @default(PENDING)
  startedAt   DateTime?
  finishedAt  DateTime?
  pagesFound  Int        @default(0)
  issuesFound Int        @default(0)
  healthScore Int?       // 0-100
  
  site        Site       @relation(fields: [siteId], references: [id], onDelete: Cascade)
  issues      CrawlIssue[]
  
  @@index([siteId, startedAt])
}

enum CrawlStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

model CrawlIssue {
  id          String       @id @default(cuid())
  crawlId     String
  url         String
  type        IssueType
  severity    IssueSeverity
  message     String
  details     Json?        // Additional context
  
  crawl       Crawl        @relation(fields: [crawlId], references: [id], onDelete: Cascade)
  
  @@index([crawlId, type])
}

enum IssueType {
  BROKEN_LINK           // 404, 500, etc.
  REDIRECT              // 301, 302 chains
  MISSING_TITLE         // No <title> tag
  MISSING_DESCRIPTION   // No meta description
  DUPLICATE_TITLE       // Same title on multiple pages
  DUPLICATE_DESCRIPTION // Same description on multiple pages
  MISSING_H1            // No H1 heading
  MULTIPLE_H1           // More than one H1
  MISSING_ALT           // Images without alt text
  MISSING_CANONICAL     // No canonical tag
  MISSING_ROBOTS        // No robots.txt
  MISSING_SITEMAP       // No sitemap.xml
  MISSING_SCHEMA        // No structured data
  SLOW_PAGE             // Load time > 3s
  MIXED_CONTENT         // HTTP resources on HTTPS page
  LARGE_PAGE            // Page size > 3MB
}

enum IssueSeverity {
  CRITICAL
  WARNING
  INFO
}

// ============ CORE WEB VITALS ============

model VitalsReport {
  id          String   @id @default(cuid())
  siteId      String
  url         String
  date        DateTime @default(now())
  device      String   // MOBILE or DESKTOP
  
  // Core Web Vitals
  lcp         Float?   // Largest Contentful Paint (seconds)
  fid         Float?   // First Input Delay (milliseconds)
  cls         Float?   // Cumulative Layout Shift (score)
  inp         Float?   // Interaction to Next Paint (milliseconds)
  
  // Performance
  perfScore   Int?     // 0-100 Lighthouse performance score
  speedIndex  Float?   // Speed Index (seconds)
  ttfb        Float?   // Time to First Byte (seconds)
  
  site        Site     @relation(fields: [siteId], references: [id], onDelete: Cascade)
  
  @@index([siteId, date])
  @@index([siteId, url, date])
}

// ============ ALERTS ============

model Alert {
  id          String     @id @default(cuid())
  userId      String
  siteId      String
  type        AlertType
  channel     AlertChannel
  config      Json       // Thresholds, webhook URL, etc.
  enabled     Boolean    @default(true)
  lastFired   DateTime?
  createdAt   DateTime   @default(now())
  
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  site        Site       @relation(fields: [siteId], references: [id], onDelete: Cascade)
}

enum AlertType {
  TRAFFIC_DROP       // Clicks dropped > X%
  POSITION_CHANGE    // Keyword position changed > X
  NEW_404            // New broken links detected
  VITALS_DEGRADED    // Core Web Vitals got worse
  CRAWL_ISSUES       // New crawl issues detected
}

enum AlertChannel {
  EMAIL
  TELEGRAM
  WEBHOOK
  SLACK
}
```

---

## Environment Variables

Following Umami's 2-variable simplicity pattern:

```bash
# .env.example

# ============ REQUIRED ============
DATABASE_URL=postgresql://crawlseo:crawlseo@localhost:5432/crawlseo
APP_SECRET=change-me-to-random-string  # Run: openssl rand -hex 32

# ============ GOOGLE OAUTH (required for GSC data) ============
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ============ OPTIONAL ============
# NEXTAUTH_URL=http://localhost:3000          # Auto-detected in most cases
# DISABLE_REGISTRATION=false                  # Set true after first user
# CRAWL_SCHEDULE=0 0 * * 0                    # Cron: weekly Sunday midnight
# GSC_SYNC_SCHEDULE=0 2 * * *                 # Cron: daily 2am
# VITALS_SCHEDULE=0 3 * * 0                   # Cron: weekly Sunday 3am
# TELEGRAM_BOT_TOKEN=                         # For Telegram alerts
# SMTP_HOST=                                  # For email alerts
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=alerts@crawlseo.dev
```

---

## Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    restart: always
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    restart: always
    volumes:
      - db_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: crawlseo
      POSTGRES_USER: crawlseo
      POSTGRES_PASSWORD: crawlseo
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U crawlseo"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  db_data:
```

---

## Dockerfile

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

---

## Pages and UI

### Page 1: Login

- Route: `/login`
- Single button: "Sign in with Google"
- Google OAuth requests scopes: `openid email profile https://www.googleapis.com/auth/webmasters.readonly`
- After login, redirect to dashboard
- Clean, minimal page with CrawlSEO logo

### Page 2: Dashboard (Overview)

- Route: `/` (requires auth)
- Site selector dropdown at top (if multiple sites)
- KPI cards row:
  - Total clicks (last 28 days) with % change vs previous 28 days
  - Total impressions with % change
  - Average position with change
  - Crawl health score (0-100)
- Traffic chart: clicks and impressions over time (line chart, last 90 days)
- Top 10 keywords table: query, position, clicks, impressions, CTR, position change
- Recent issues panel: latest crawl issues sorted by severity
- Core Web Vitals summary: LCP, CLS, INP scores with pass/fail indicators

### Page 3: Sites

- Route: `/sites`
- List of connected sites with key metrics
- "Add site" button — opens modal:
  1. Fetches available GSC properties via API
  2. User selects a property
  3. Site is added, first GSC sync triggers immediately
- Each site card shows: domain, last crawl date, health score, total clicks

### Page 4: Keywords

- Route: `/sites/[siteId]/keywords`
- Full table with all keywords from GSC
- Columns: query, position, clicks, impressions, CTR, position change (7d, 28d)
- Sortable by any column
- Filter by: position range, clicks minimum, date range
- Click on keyword to see position history chart
- Highlight "quick wins": position 4-20 with high impressions (easy to push to page 1)

### Page 5: Pages

- Route: `/sites/[siteId]/pages`
- Table of all pages with GSC data
- Columns: URL, clicks, impressions, avg position, CTR
- Click on page to see: keywords ranking for this page, crawl issues on this page, vitals for this page

### Page 6: Crawl Results

- Route: `/sites/[siteId]/crawl`
- Health score circle (0-100)
- Issues grouped by type with counts
- Issue list: URL, type, severity, description
- Filter by severity (critical, warning, info)
- "Crawl now" button to trigger manual crawl
- History of past crawls with scores

### Page 7: Core Web Vitals

- Route: `/sites/[siteId]/vitals`
- Overview cards: LCP, CLS, INP with pass/fail status
- Mobile vs Desktop toggle
- Pages with worst vitals (sorted by LCP)
- Vitals trend over time (line chart)
- Recommendations from PageSpeed API

### Page 8: Correlation View (killer feature)

- Route: `/sites/[siteId]/insights`
- Pages where ALL of these are true:
  - GSC position declined in last 28 days
  - Core Web Vitals are poor (red)
  - Crawl issues exist (404, missing meta, etc.)
- Prioritized list: fix these pages first for maximum SEO impact
- Each item shows: the page URL, which positions dropped, which vitals failed, which crawl issues exist

### Page 9: Alerts

- Route: `/sites/[siteId]/alerts`
- Create alert rules:
  - Traffic drops > X% over Y days
  - Keyword position changes > X positions
  - New 404 errors detected
  - Core Web Vitals degradation
- Channel: email, Telegram, webhook, Slack
- Alert history log

### Page 10: Settings

- Route: `/settings`
- Account info (Google account connected)
- Crawl schedule configuration
- GSC sync frequency
- Notification preferences
- Export data (CSV)
- Delete account

---

## Crawler Specification

The crawler is a core component. It should:

### What to crawl

- Start from the site's homepage
- Follow all internal links (same domain)
- Respect robots.txt directives
- Follow redirects and record chains
- Maximum depth: 10 levels (configurable)
- Maximum pages: 500 per crawl in free version (configurable)
- Timeout: 10 seconds per page

### What to check per page

```typescript
interface CrawlPageResult {
  url: string;
  statusCode: number;
  redirectChain: string[];        // If redirected, track the chain
  loadTime: number;               // Time to fetch in ms
  contentLength: number;          // Page size in bytes
  
  // Meta
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  canonical: string | null;
  robots: string | null;          // Meta robots tag content
  
  // Structure
  h1: string[];                   // All H1 tags (should be exactly 1)
  h2Count: number;
  wordCount: number;
  
  // Images
  images: {
    total: number;
    withoutAlt: number;
    urls: string[];
  };
  
  // Links
  internalLinks: string[];
  externalLinks: string[];
  brokenLinks: string[];          // Links that returned 4xx/5xx
  
  // Technical
  hasSchema: boolean;             // Any JSON-LD or microdata
  schemaTypes: string[];          // e.g. ["Organization", "BreadcrumbList"]
  isHttps: boolean;
  hasMixedContent: boolean;
  hasHreflang: boolean;
  openGraphTags: Record<string, string>;
}
```

### What to check site-wide

```typescript
interface CrawlSiteResult {
  robotsTxt: {
    exists: boolean;
    content: string | null;
    issues: string[];
  };
  sitemap: {
    exists: boolean;
    url: string | null;
    urlCount: number;
    issues: string[];             // e.g. URLs in sitemap that 404
  };
  totalPages: number;
  totalIssues: number;
  healthScore: number;            // Calculated 0-100
}
```

### Health Score Calculation

```
healthScore = 100 - deductions

Deductions:
- Each critical issue: -5 points
- Each warning: -2 points
- Each info: -0.5 points
- Cap at 0 (minimum score)
```

### Implementation

Use `fetch` (Node.js native) or `undici` for HTTP requests. No Puppeteer/Playwright in v1 — keep it lightweight. Parse HTML with `cheerio` (fast, no browser needed). Run crawl in a worker/background job, not blocking the main thread. Store results in database, not files.

---

## GSC API Integration

### OAuth Flow

1. User clicks "Sign in with Google" on login page
2. NextAuth redirects to Google OAuth consent screen
3. Request scopes: `openid email profile https://www.googleapis.com/auth/webmasters.readonly`
4. On callback, store access_token and refresh_token encrypted in database
5. Use refresh_token for background API calls (tokens expire after 1 hour)

### Data Fetching

```typescript
// What we fetch from GSC API

// 1. List of sites (on login / add site)
// GET https://www.googleapis.com/webmasters/v3/sites
// Returns list of verified properties

// 2. Search analytics (daily sync)
// POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
// Body:
{
  "startDate": "2026-01-01",
  "endDate": "2026-04-06",
  "dimensions": ["query", "page", "date", "device", "country"],
  "rowLimit": 25000,
  "startRow": 0
}
// Returns: rows with clicks, impressions, ctr, position

// 3. URL inspection (on demand)
// POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
// Body: { "inspectionUrl": "https://...", "siteUrl": "sc-domain:..." }
// Returns: index status, crawl info, mobile usability
```

### Sync Strategy

- First sync: fetch last 90 days of data
- Daily sync: fetch yesterday's data (GSC data has 2-3 day delay)
- Store all rows in `Keyword` and `Page` tables with date
- Paginate through results (25k rows per request, use startRow)
- Handle rate limits: 1,200 queries per minute per site

---

## PageSpeed Integration

### API Call

```typescript
// GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed
// Params:
//   url: https://brandson.digital
//   category: PERFORMANCE
//   strategy: MOBILE (or DESKTOP)
//   key: (optional, increases quota)

// Response includes:
// - lighthouseResult.categories.performance.score (0-1)
// - lighthouseResult.audits['largest-contentful-paint'].numericValue
// - lighthouseResult.audits['cumulative-layout-shift'].numericValue
// - lighthouseResult.audits['interaction-to-next-paint'].numericValue
// - lighthouseResult.audits['speed-index'].numericValue
// - lighthouseResult.audits['server-response-time'].numericValue
```

### Strategy

- Check top 10 pages by traffic (from GSC data) on each sync
- Check both mobile and desktop
- Store results in `VitalsReport` table
- Rate limit: max 1 request per second, 25k per day

---

## Alert System

### Types

1. **Traffic Drop**: Compare clicks in last 7 days vs previous 7 days. Alert if drop > threshold (default 20%)
2. **Position Change**: Alert when a tracked keyword moves > X positions (default 5)
3. **New 404**: After each crawl, compare with previous crawl. Alert on new broken links
4. **Vitals Degraded**: Alert when any Core Web Vital moves from green to orange/red
5. **Crawl Issues**: Alert when new critical issues are found

### Channels

- **Email**: via SMTP (user configures in .env)
- **Telegram**: via Bot API (user provides bot token and chat ID)
- **Webhook**: POST JSON to user-specified URL
- **Slack**: via incoming webhook URL

### Check Schedule

- Run alert checks after each GSC sync and after each crawl
- Cooldown: don't fire same alert type more than once per 24 hours

---

## Development Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** User can log in, add a site, and see GSC data.

Tasks:
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up Prisma with PostgreSQL schema
- [ ] Implement NextAuth with Google OAuth (including GSC scopes)
- [ ] Build login page
- [ ] Build site list page with "Add site" from GSC properties
- [ ] Implement GSC API client (list sites, fetch search analytics)
- [ ] Build dashboard with KPI cards and traffic chart
- [ ] Build keywords table (sortable, filterable)
- [ ] Build pages table
- [ ] Set up Docker Compose for local development
- [ ] Write initial GSC sync background job

### Phase 2: Crawler (Week 3-4)

**Goal:** User can crawl their site and see technical issues.

Tasks:
- [ ] Build crawler engine (fetch, cheerio, link following)
- [ ] Implement robots.txt parser and respect
- [ ] Implement sitemap.xml detection and validation
- [ ] Check all page-level items (meta, H1, images, links, schema)
- [ ] Calculate health score
- [ ] Build crawl results page with issues list
- [ ] Build crawl history view
- [ ] Add "Crawl now" button
- [ ] Set up crawl background job with scheduling

### Phase 3: Core Web Vitals (Week 5)

**Goal:** User can see PageSpeed data for their top pages.

Tasks:
- [ ] Implement PageSpeed Insights API client
- [ ] Fetch vitals for top pages by traffic
- [ ] Build vitals overview page
- [ ] Build vitals trend chart
- [ ] Mobile vs Desktop comparison view
- [ ] Set up vitals sync background job

### Phase 4: Correlation + Alerts (Week 6)

**Goal:** User sees prioritized insights and gets notified.

Tasks:
- [ ] Build correlation/insights page (pages with declining position + poor vitals + crawl issues)
- [ ] Implement alert system (types, channels, cooldown)
- [ ] Build alerts configuration page
- [ ] Implement email notifications (SMTP)
- [ ] Implement Telegram notifications
- [ ] Implement webhook notifications
- [ ] Build alert history log

### Phase 5: Polish + Launch (Week 7-8)

**Goal:** Production-ready for GitHub launch.

Tasks:
- [ ] Multi-site support with site switcher
- [ ] Historical data retention and trend charts
- [ ] Quick wins view (position 4-20, high impressions)
- [ ] Export data as CSV
- [ ] Dockerfile with multi-stage build
- [ ] Docker Compose with healthchecks
- [ ] .env.example with documentation
- [ ] README with screenshots, comparison table, quick start
- [ ] Deploy buttons for Railway, Render
- [ ] Static landing page on crawlseo.dev/pro
- [ ] Launch on GitHub, Hacker News, Reddit, Twitter

---

## README Structure

Follow Plausible's proven formula:

```markdown
<p align="center">
  <img src="logo.svg" alt="CrawlSEO" width="200" />
</p>

<h3 align="center">
  Open-source SEO monitoring for founders
</h3>

<p align="center">
  Google Search Console + Site Crawler + Core Web Vitals in one dashboard.
  <br />
  Self-hosted. Free forever.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="https://demo.crawlseo.dev">Live Demo</a> •
  <a href="#docs">Docs</a>
</p>

<p align="center">
  [badges: stars, license, docker pulls, deploy buttons]
</p>

[Full-width dashboard screenshot]

## Why CrawlSEO?

| | CrawlSEO | Ahrefs | Semrush | Moz | SEO Gets |
|---|---|---|---|---|---|
| Price | **Free** | €119/mo | $139/mo | $49/mo | $14/mo |
| Self-hosted | ✅ | ❌ | ❌ | ❌ | ❌ |
| GSC data | ✅ | ✅ | ✅ | ✅ | ✅ |
| Site crawler | ✅ | ✅ | ✅ | ✅ | ❌ |
| Core Web Vitals | ✅ | ❌ | ✅ | ❌ | ❌ |
| Open source | ✅ | ❌ | ❌ | ❌ | ❌ |
| Your data stays yours | ✅ | ❌ | ❌ | ❌ | ❌ |

## Quick Start

\```bash
git clone https://github.com/crawlseo/crawlseo.git
cd crawlseo
cp .env.example .env
# Edit .env with your Google OAuth credentials
docker compose up -d
\```

Open http://localhost:3000 and sign in with Google.

## Features
## Screenshots
## Deploy
## Contributing
## License

Built by [Brandson Digital](https://brandson.digital) • Created by [Mike](https://m1ke.digital)
```

---

## What NOT to Build

Explicitly out of scope to keep the project focused:

- **Backlink index** — requires crawling billions of pages (Ahrefs-level infrastructure)
- **Keyword volume database** — requires Google Ads API partnership or massive scraping
- **Competitor traffic estimates** — requires ISP/browser panel data
- **SERP scraping / rank tracking** — requires proxies, captcha solving. SerpBear already does this
- **AI content generation** — out of scope, different product
- **Social media tracking** — out of scope
- **PPC / Google Ads integration** — out of scope for v1

---

## Success Metrics

### GitHub
- 100 stars in first week
- 1,000 stars in first month
- 5,000 stars in 3 months (eligible for Claude OSS program)

### Product
- 50 self-hosted installations in first month (track via optional telemetry ping)
- <5 min from git clone to working dashboard
- <3 critical bugs open at any time

### Brand
- 10+ backlinks to brandson.digital from blog posts, articles, listings
- Listed in awesome-seo-tools, awesome-selfhosted
- Featured on Hacker News front page

---

## References

### Architecture inspiration
- Umami (github.com/umami-software/umami) — 35k stars, Next.js + PostgreSQL, 2 env vars
- SerpBear (github.com/towfiqi/serpbear) — 1.9k stars, Next.js + SQLite, rank tracking
- Plausible (github.com/plausible/analytics) — 24k stars, best README pattern

### API documentation
- Google Search Console API: https://developers.google.com/webmaster-tools/v1/api_reference_index
- PageSpeed Insights API: https://developers.google.com/speed/docs/insights/v5/get-started
- URL Inspection API: https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
