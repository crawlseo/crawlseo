# CrawlSEO Phase 1 Implementation Plan

**Phase:** Foundation  
**Goal:** User can log in, add a site, and see GSC data.  
**Duration:** Week 1-2 (10 working days)  
**Status:** Planning

---

## Task Execution Order & Dependencies

### Wave 1: Project Setup (Day 1)
*These tasks have no dependencies and run in parallel.*

#### T1.1: Initialize Next.js Project
- Create Next.js 14+ project with TypeScript
- Set up App Router structure
- Configure import aliases (@/)
- Install core dependencies: typescript, react, next
- **Output:** Basic Next.js project structure
- **Depends on:** Nothing
- **Blocks:** All other tasks

#### T1.2: Configure Styling & UI Framework
- Install Tailwind CSS v4
- Install shadcn/ui
- Set up tailwind.config.ts
- Initialize shadcn/ui components
- **Output:** Working Tailwind setup, shadcn/ui ready
- **Depends on:** T1.1
- **Blocks:** All page/component tasks

#### T1.3: Set Up Environment Variables
- Create `.env.example` with all required variables
- Create `.env.local` for development
- Document each variable with purpose and format
- Include placeholder values for Google OAuth
- **Output:** .env files and documentation
- **Depends on:** T1.1
- **Blocks:** T2.x (database), T3.x (auth)

---

### Wave 2: Database & ORM (Day 1-2)
*Depends on Wave 1. Can run in parallel after Wave 1.*

#### T2.1: Set Up Prisma
- Install Prisma and @prisma/client
- Initialize Prisma with PostgreSQL datasource
- Set DATABASE_URL in .env
- Create prisma/schema.prisma
- **Output:** prisma/ directory with schema skeleton
- **Depends on:** T1.1, T1.3
- **Blocks:** T2.2

#### T2.2: Create Prisma Schema
- Define User model with OAuth fields
- Define Session model
- Define Site model
- Define Keyword model
- Define Page model
- Define Crawl and CrawlIssue models
- Define VitalsReport model
- Define Alert models
- Add indexes and relations
- **Output:** Complete prisma/schema.prisma
- **Depends on:** T2.1
- **Blocks:** T2.3

#### T2.3: Set Up PostgreSQL + Docker Compose
- Create docker-compose.yml with PostgreSQL 16
- Add healthchecks for db
- Add volumes for data persistence
- Add environment variables for postgres
- **Output:** docker-compose.yml ready for development
- **Depends on:** T1.3, T2.1
- **Blocks:** T2.4

#### T2.4: Initialize Database & Migrations
- Run `npx prisma migrate dev --name init`
- Generate Prisma Client
- Verify database schema created in PostgreSQL
- **Output:** Database schema in PostgreSQL, Prisma Client generated
- **Depends on:** T2.2, T2.3
- **Blocks:** T3.2, T4.x

---

### Wave 3: Authentication (Day 2-3)
*Depends on Database setup. Can start once T2.4 complete.*

#### T3.1: Install & Configure NextAuth.js
- Install next-auth @next-auth/prisma-adapter
- Create auth configuration with Prisma adapter
- Set up NextAuth secret in .env
- Configure Google OAuth provider
  - Use GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
  - Request scopes: openid, email, profile, webmasters.readonly
- **Output:** NextAuth configured and ready
- **Depends on:** T1.3, T2.4
- **Blocks:** T3.2

#### T3.2: Create Auth API Routes
- Create app/api/auth/[...nextauth]/route.ts
- Configure callback handlers for signin/callback/jwt/session
- Store encrypted Google tokens in User.googleTokens
- Set up token refresh logic
- **Output:** Working NextAuth API routes
- **Depends on:** T3.1, T2.4
- **Blocks:** T3.3, T4.x

#### T3.3: Build Login Page
- Create app/(auth)/login/page.tsx
- Add CrawlSEO logo/branding
- Create "Sign in with Google" button
- Implement redirect to dashboard on success
- Implement redirect to login if not authenticated (middleware)
- Add protected route middleware
- **Output:** Working login page
- **Depends on:** T3.2, T1.2
- **Blocks:** Dashboard tasks

---

### Wave 4: Google API Integration (Day 3-4)
*Depends on Authentication. Can start once T3.2 complete.*

#### T4.1: Create GSC API Client
- Create lib/google/gsc-client.ts
- Implement getAccessToken() with refresh logic
- Implement listSites(userId) - fetch from GSC API
- Implement fetchSearchAnalytics(siteUrl, startDate, endDate, dimensions)
  - Support pagination (startRow)
  - Support dimensions: query, page, date, device, country
  - Parse response into rows with clicks, impressions, ctr, position
- Add error handling and rate limit awareness
- Add request/response logging
- **Output:** GSC API client module
- **Depends on:** T3.2
- **Blocks:** T4.2, T5.x, T6.1

#### T4.2: Create URL Inspection & PageSpeed Clients
- Create lib/google/url-inspection-client.ts
- Implement inspectUrl(siteUrl, inspectionUrl)
- Create lib/google/pagespeed-client.ts
- Implement fetchPageSpeed(url, strategy: 'MOBILE'|'DESKTOP')
- Parse performance metrics (LCP, CLS, INP, etc.)
- **Output:** URL Inspection and PageSpeed client modules
- **Depends on:** T3.2
- **Blocks:** Phase 2-3 tasks

---

### Wave 5: Site Management (Day 4)
*Depends on GSC API. Can start once T4.1 complete.*

#### T5.1: Build Site List Page
- Create app/(dashboard)/sites/page.tsx
- List all sites for current user from database
- Show key metrics: domain, last crawl date, health score, total clicks
- Implement site cards with basic styling
- **Output:** Functional sites list page
- **Depends on:** T4.1, T3.3
- **Blocks:** T5.2

#### T5.2: Build "Add Site" Modal
- Create component for modal
- Fetch available GSC properties via T4.1 client
- Display dropdown/list of properties
- On selection, create Site record in database with gscProperty
- Trigger initial GSC data sync (see T6.1)
- Show success/error feedback
- **Output:** Working add site functionality
- **Depends on:** T5.1, T4.1, T2.4
- **Blocks:** Data display pages

#### T5.3: Implement Site Switcher
- Add site dropdown to dashboard header/layout
- Support multi-site navigation
- Filter data by selected site
- Persist selection in session/localStorage
- **Output:** Site switcher component in layout
- **Depends on:** T5.1
- **Blocks:** Dashboard refinement

---

### Wave 6: Dashboard & Data Display (Day 5-7)
*Depends on GSC API and site management. Run in parallel.*

#### T6.1: Implement GSC Sync Background Job
- Create lib/workers/gsc-sync.ts
- Function: syncGSCDataForSite(siteId, daysBack = 28)
  - Fetch search analytics from T4.1 client
  - Paginate through all results
  - Parse each row and create Keyword/Page records
  - Update lastSyncAt timestamp on Site
- Implement error handling and logging
- **Output:** GSC sync worker function
- **Depends on:** T4.1, T2.4
- **Blocks:** T6.2, T6.3, T6.4

#### T6.2: Build Dashboard Overview Page
- Create app/(dashboard)/page.tsx
- Create KPI cards component:
  - Total clicks (last 28 days) with % change
  - Total impressions with % change
  - Average position with change indicator
  - Crawl health score (0-100, placeholder for now)
- Create traffic chart (line chart with clicks + impressions, last 90 days)
  - Use Recharts
  - Handle empty data gracefully
- Create top 10 keywords table component
  - Columns: query, position, clicks, impressions, CTR
  - Sortable, filterable
  - Link to keyword detail view (future)
- **Output:** Dashboard page with KPIs and charts
- **Depends on:** T6.1, T3.3, T5.3
- **Blocks:** Refinement tasks

#### T6.3: Build Keywords Table Page
- Create app/(dashboard)/sites/[siteId]/keywords/page.tsx
- Display all keywords from Keyword table
- Columns: query, position, clicks, impressions, CTR, position change (7d, 28d)
- Implement sortable columns
- Implement filters:
  - Position range slider
  - Minimum clicks threshold
  - Date range picker
- Calculate position change by comparing dates
- Link to individual keyword detail page (optional v1)
- **Output:** Full-featured keywords page
- **Depends on:** T6.1, T5.1, T1.2
- **Blocks:** None (optional enhancement)

#### T6.4: Build Pages Table Page
- Create app/(dashboard)/sites/[siteId]/pages/page.tsx
- Display all pages from Page table
- Columns: URL, clicks, impressions, avg position, CTR
- Implement sortable columns
- Implement filters by URL pattern, date range
- Link to page detail view (optional v1)
- **Output:** Pages table page
- **Depends on:** T6.1, T5.1, T1.2
- **Blocks:** None (optional enhancement)

#### T6.5: Build Layout Components
- Create components/layout/Header.tsx with navigation
- Create components/layout/Sidebar.tsx with nav links
- Create components/layout/RootLayout wrapper
- Implement responsive mobile menu
- Add logout button
- **Output:** Layout components used across pages
- **Depends on:** T3.3, T1.2
- **Blocks:** All page tasks (should be done early)

---

### Wave 7: API Routes (Day 7-8)
*Can run in parallel with UI tasks after Wave 4.*

#### T7.1: Create Site API Routes
- Create app/api/sites/route.ts
  - GET: list user's sites
  - POST: create site (not used in UI yet, for future)
- Create app/api/sites/[siteId]/route.ts
  - GET: fetch single site with metrics
  - PUT: update site settings
  - DELETE: delete site
- **Output:** Site CRUD API endpoints
- **Depends on:** T3.2, T2.4
- **Blocks:** None (UI calls DB directly in v1)

#### T7.2: Create GSC Data API Routes
- Create app/api/gsc/sync/route.ts
  - POST: trigger manual GSC sync for a site
  - Returns status and sync time
- Create app/api/gsc/properties/route.ts
  - GET: list available GSC properties for current user
- **Output:** GSC data API endpoints
- **Depends on:** T4.1, T3.2
- **Blocks:** None

#### T7.3: Create Health Check Endpoint
- Create app/api/health/route.ts
- Returns 200 OK with status (for Docker healthcheck)
- Check database connectivity
- **Output:** Health check endpoint
- **Depends on:** T1.1, T2.4
- **Blocks:** T8.1 (Docker setup)

---

### Wave 8: Local Development Setup (Day 8)
*Depends on having a working app.*

#### T8.1: Update Docker Compose for Full Stack
- Add app service to docker-compose.yml
- Build from Dockerfile
- Set environment variables
- Map port 3000
- Add healthcheck for app service
- Add depends_on: db with condition
- **Output:** Full docker-compose.yml with app + db
- **Depends on:** T2.3, T7.3
- **Blocks:** T8.2

#### T8.2: Create Development Documentation
- Update README.md with:
  - Quick start guide (git clone, cp .env, docker compose up)
  - Environment variable setup
  - Google OAuth configuration steps
  - Database migrations
  - Available scripts (npm run dev, build, etc.)
- Create DEVELOPMENT.md with:
  - Architecture overview
  - File structure explanation
  - How to run locally
  - How to run tests (if applicable)
- **Output:** Developer-friendly documentation
- **Depends on:** T8.1, T1.3
- **Blocks:** Launch tasks (Phase 5)

#### T8.3: Create .env.example Documentation
- Document all required variables with descriptions
- Include example values where helpful
- Explain Google OAuth setup
- Explain optional scheduling variables
- **Output:** Well-documented .env.example
- **Depends on:** T1.3
- **Blocks:** None

---

### Wave 9: Testing & Verification (Day 9-10)
*Runs at the end to verify all components work together.*

#### T9.1: Manual Testing Checklist
- [ ] Docker Compose startup succeeds
- [ ] Database migrations run automatically
- [ ] Login with Google OAuth works
- [ ] OAuth tokens stored in User.googleTokens
- [ ] Can add a site from GSC properties
- [ ] GSC sync job runs and populates Keyword/Page tables
- [ ] Dashboard loads and displays metrics
- [ ] Site switcher works across pages
- [ ] Keywords and pages tables load and sort
- [ ] Logout works
- [ ] Protected routes redirect to login
- **Output:** Verified working Phase 1
- **Depends on:** All prior tasks
- **Blocks:** Phase 2 start

#### T9.2: Edge Case Testing
- Test with 0 sites
- Test with 1 site
- Test with multiple sites
- Test with large keyword dataset (10k+ keywords)
- Test OAuth failure/cancellation
- Test database connection failure
- **Output:** Edge cases documented/handled
- **Depends on:** T9.1

#### T9.3: Performance Baseline
- Measure dashboard load time
- Measure keywords table sort/filter performance
- Measure GSC sync duration for typical dataset
- Document baseline metrics
- **Output:** Performance baseline document
- **Depends on:** T9.1

---

## Critical Dependencies Map

```
T1.1 (Next.js Init)
  ├─→ T1.2 (Styling)
  ├─→ T1.3 (Env)
  └─→ T2.1 (Prisma)

T1.3 (Env)
  ├─→ T2.1 (Prisma)
  └─→ T3.1 (NextAuth)

T2.1 (Prisma)
  └─→ T2.2 (Schema)
       └─→ T2.3 (Docker)
            └─→ T2.4 (Init DB)
                 ├─→ T3.2 (Auth Routes)
                 └─→ T7.1 (Site API)

T3.2 (Auth Routes)
  ├─→ T3.3 (Login Page)
  └─→ T4.1 (GSC Client)
       └─→ T5.2 (Add Site Modal)
            ├─→ T6.1 (GSC Sync)
            │    ├─→ T6.2 (Dashboard)
            │    ├─→ T6.3 (Keywords)
            │    └─→ T6.4 (Pages)

T6.5 (Layout) - parallel early, blocks page finalization
T7.3 (Health) - late task, blocks Docker setup
T8.1 (Docker Full) - requires health endpoint
```

---

## Parallelization Strategy

**Day 1:**
- T1.1 → T1.2, T1.3 (all happen sequentially but fast)

**Day 1-2 (parallel after T1):**
- Left track: T2.1 → T2.2 → T2.3 → T2.4
- Right track: T3.1 → T3.2 → T3.3
- These can overlap partially; auth can start once env + basic schema

**Day 3 (parallel):**
- Left: T4.1, T4.2 (GSC client modules)
- Right: T6.5 (Layout components)

**Day 4 (parallel):**
- T5.1, T5.2 (Sites page + add modal)
- T5.3 (Site switcher)
- T7.1, T7.2 (API routes)

**Day 5-7 (parallel):**
- T6.1 (GSC sync worker) → gates
- T6.2, T6.3, T6.4 (Dashboard, Keywords, Pages pages in parallel)

**Day 8:**
- T8.1, T8.2, T8.3 (Docker + docs)

**Day 9-10:**
- T9.x (Testing & verification)

---

## Key Milestones

| Milestone | Date | Gate | Criteria |
|-----------|------|------|----------|
| Project structure ready | Day 1 EOD | T1.1 | Next.js + Tailwind + Env |
| Database ready | Day 2 EOD | T2.4 | PostgreSQL schema created |
| Authentication working | Day 3 EOD | T3.3 | Login page functional, OAuth flow works |
| GSC data flowing | Day 4 EOD | T6.1 | Can add site, sync data, see keywords |
| Dashboard functional | Day 7 EOD | T6.2 | See KPIs and charts for own site |
| Docker ready | Day 8 EOD | T8.1 | `docker compose up` works end-to-end |
| Phase 1 complete | Day 10 EOD | T9.1 | All manual tests pass |

---

## Tech Debt & Future Refinement

These are intentionally deferred from Phase 1:
- Caching layer (Redis) - not needed for single-user local dev
- Rate limit handling - GSC API has generous limits
- Keyword trend calculations - pre-calculated in initial sync
- Error boundaries and error UI - will add in Phase 5 (polish)
- Test suite - will add in Phase 2 (parallel with crawler)
- Analytics/telemetry - Phase 5 (polish)
- Dark mode - Phase 5 (polish)
- Mobile optimization - Phase 5 (polish)
- Internationalization - Phase 5 (polish)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Google OAuth complexity | Medium | High | Start T3.1 early, test with dummy credentials |
| PostgreSQL setup issues | Low | High | Use Docker for consistency, verify T2.4 thoroughly |
| GSC API rate limits | Low | Medium | Log all API calls, implement basic backoff |
| Large keyword datasets | Medium | Medium | Add indexing in T2.2, pagination in T6.3 |
| Token refresh failures | Medium | Medium | Test refresh logic in T3.2, add logging |

---

## Success Criteria for Phase 1

✅ User can sign in with Google OAuth  
✅ User can add a site by selecting from GSC properties  
✅ User can see top 10 keywords on dashboard  
✅ User can see traffic trends (clicks + impressions) over 90 days  
✅ User can view all keywords with sorting/filtering  
✅ User can view all pages with metrics  
✅ Dashboard loads in <2 seconds for typical dataset  
✅ Multi-site support works with site switcher  
✅ Docker Compose setup works with one command  
✅ No critical bugs in manual testing  
