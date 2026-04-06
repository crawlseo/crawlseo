# Phase 1 Testing & Verification

## Manual Testing Checklist (T9.1)

### Authentication Flow ✅
- [ ] **Login page loads** - Navigate to http://localhost:3000/login
  - [ ] Logo and sign-in button visible
  - [ ] Styling matches design
  - [ ] Responsive on mobile

- [ ] **Google OAuth works** - Click "Sign in with Google"
  - [ ] Redirected to Google consent screen
  - [ ] OAuth scopes are correct (webmasters.readonly)
  - [ ] Redirected back to dashboard on success
  - [ ] Session created in database

- [ ] **Session persists** - Refresh page
  - [ ] Logged in state maintained
  - [ ] User email shown in header
  - [ ] No authentication errors

- [ ] **Sign out works**
  - [ ] Click sign out button
  - [ ] Redirected to login page
  - [ ] Session cleared from database

### Dashboard (0 Sites) ✅
- [ ] **Empty state shows**
  - [ ] Friendly message displayed
  - [ ] "Add Your First Site" button visible
  - [ ] Responsive layout

### Site Management ✅
- [ ] **Add Site Modal** - Click "Add Site"
  - [ ] Dialog opens
  - [ ] GSC properties load successfully
  - [ ] Can select property from dropdown
  - [ ] "Add Site" button becomes enabled
  - [ ] Success message shows on creation
  - [ ] Page refreshes to show new site

- [ ] **Sites Page** - Navigate to /sites
  - [ ] All sites displayed in grid
  - [ ] Site cards show: domain, keywords count, creation date
  - [ ] Can click site card to navigate to keywords
  - [ ] Site switcher shows all sites

- [ ] **Site Switcher** - Header switcher
  - [ ] Shows all sites in dropdown
  - [ ] Can select different site
  - [ ] Navigation updates on select
  - [ ] Selection persists (localStorage)

### Keywords & Pages Tables ✅
- [ ] **Keywords Page** - Navigate to /sites/[siteId]/keywords
  - [ ] Page loads with site domain
  - [ ] Keywords table displays (if data synced)
  - [ ] Columns: Query, Position, Clicks, Impressions, CTR
  - [ ] Data sorted by clicks descending
  - [ ] "Showing 50 of X keywords" message appears if >50
  - [ ] Empty state shows if no data yet

- [ ] **Pages Page** - Navigate to /sites/[siteId]/pages
  - [ ] Page loads with site domain
  - [ ] Tab navigation shows (Keywords/Pages)
  - [ ] Pages table displays (if data synced)
  - [ ] Columns: URL, Position, Clicks, Impressions, CTR
  - [ ] URLs are clickable links
  - [ ] Data sorted by clicks descending
  - [ ] Empty state shows if no data yet

- [ ] **Tab Navigation**
  - [ ] Keywords tab highlighted when on keywords page
  - [ ] Pages tab highlighted when on pages page
  - [ ] Clicking tab switches pages
  - [ ] Active tab has border-bottom styling

### Dashboard Overview (1+ Site) ✅
- [ ] **Dashboard loads with data**
  - [ ] If 1 site: Full dashboard with metrics
  - [ ] If 2+ sites: Site grid view

- [ ] **KPI Cards show metrics**
  - [ ] Total Clicks card (28-day total)
  - [ ] Total Impressions card
  - [ ] Avg Position card
  - [ ] Keywords Tracked count
  - [ ] All show percent change vs previous 28 days
  - [ ] Green ↑ for positive, Red ↓ for negative

- [ ] **Traffic Chart renders**
  - [ ] Line chart visible with Recharts
  - [ ] Clicks line (blue) and Impressions line (purple)
  - [ ] 90-day data displayed
  - [ ] Tooltip shows on hover
  - [ ] Legend shows both metrics

- [ ] **Top Keywords Table shows**
  - [ ] Top 10 keywords by clicks
  - [ ] Rank badges (#1-#10)
  - [ ] Query, Position, Clicks, Impressions, CTR columns
  - [ ] Data aggregated correctly

### Navigation & Layout ✅
- [ ] **Header layout**
  - [ ] Logo + "CrawlSEO" text visible
  - [ ] User email shown
  - [ ] Sign Out button present
  - [ ] All elements aligned properly

- [ ] **Main navigation**
  - [ ] "Overview" link navigates to /dashboard
  - [ ] "Sites" link navigates to /sites
  - [ ] Active page highlighted

- [ ] **Responsive Design**
  - [ ] Desktop: Full layout rendered
  - [ ] Tablet (768px): Layout adapts
  - [ ] Mobile (375px): Stacked layout
  - [ ] Tables scroll horizontally on mobile

### Protected Routes ✅
- [ ] **Middleware works**
  - [ ] Logged-out user trying to access /dashboard redirected to /login
  - [ ] Logged-out user trying to access /sites redirected to /login
  - [ ] Login page accessible without auth

- [ ] **Ownership checks**
  - [ ] User can only see their own sites
  - [ ] Trying to access another user's site returns error
  - [ ] API returns 403 Forbidden for unauthorized access

---

## Edge Case Testing (T9.2)

### 0 Sites ✅
- [ ] User with no sites sees empty state
- [ ] "Add Your First Site" button works
- [ ] Site switcher hidden (no sites to switch)
- [ ] Dashboard shows helpful message

### 1 Site ✅
- [ ] Full dashboard loads immediately
- [ ] KPI cards show correct calculations
- [ ] Site switcher hidden (no choice to make)
- [ ] All tables show data correctly

### 2+ Sites ✅
- [ ] Dashboard shows site grid (not full dashboard)
- [ ] Site switcher dropdown shows all sites
- [ ] Can navigate between sites
- [ ] Each site has separate data

### Large Datasets ✅
- [ ] 1000+ keywords in table
  - [ ] Only shows top 50
  - [ ] "Showing 50 of 1000" message accurate
  - [ ] Table still responsive
  - [ ] No UI crashes

- [ ] 30+ pages in table
  - [ ] All display correctly
  - [ ] Sorting works on large dataset
  - [ ] No performance issues

### Missing/Null Data ✅
- [ ] Keyword with no device data
  - [ ] Displays without device label
  - [ ] Still shows in table

- [ ] Page with 0 clicks
  - [ ] Shows "0" correctly
  - [ ] Not hidden or filtered out

- [ ] Missing meta tags in crawl results (Phase 2)
  - [ ] Issues display "not found" or similar

### Timezone/Date Handling ✅
- [ ] Dates normalize to start of day (00:00:00)
- [ ] No duplicate data from timezone issues
- [ ] Chart dates align correctly across day boundaries
- [ ] Percent change calculations use correct date ranges

### OAuth Edge Cases ✅
- [ ] User cancels Google consent
  - [ ] Returns to login page
  - [ ] Error message shown (if implemented)

- [ ] User revokes Google auth after login
  - [ ] Next sync attempt fails gracefully
  - [ ] User prompted to re-authenticate

- [ ] OAuth token expired
  - [ ] Automatic refresh happens
  - [ ] User sees no interruption
  - [ ] Refreshed token saved to database

- [ ] User has no GSC access
  - [ ] Add Site modal loads
  - [ ] "No GSC properties found" message shown
  - [ ] Error message helpful

### Database Edge Cases ✅
- [ ] Deleting site cascades to all related data
  - [ ] Keywords deleted
  - [ ] Pages deleted
  - [ ] Crawls deleted (future)
  - [ ] Vitals deleted (future)

- [ ] Duplicate data from race conditions
  - [ ] Upsert handles concurrent syncs
  - [ ] No duplicate keywords for same (siteId, query, date)

---

## Performance Baseline (T9.3)

### Load Times (Target <3s)
Measure with DevTools Network tab:

- [ ] **Dashboard Overview Page**
  - [ ] Initial load: ___ ms
  - [ ] With 100 keywords: ___ ms
  - [ ] With 30 pages: ___ ms

- [ ] **Keywords Table Page**
  - [ ] With 50 keywords: ___ ms
  - [ ] With 100 keywords: ___ ms
  - [ ] With 500 keywords: ___ ms

- [ ] **Pages Table Page**
  - [ ] With 20 pages: ___ ms
  - [ ] With 50 pages: ___ ms

- [ ] **Login Page**
  - [ ] Initial load: ___ ms

- [ ] **Sites List Page**
  - [ ] With 1 site: ___ ms
  - [ ] With 5 sites: ___ ms
  - [ ] With 10 sites: ___ ms

### Core Web Vitals (Lighthouse)
Run Lighthouse in DevTools:

- [ ] **Dashboard (with data)**
  - [ ] Performance: >= 90
  - [ ] Accessibility: >= 90
  - [ ] Best Practices: >= 90
  - [ ] SEO: >= 90

- [ ] **Tables Page**
  - [ ] Performance: >= 85 (tables can be slower)
  - [ ] Accessibility: >= 90

### API Response Times (Target <500ms)

- [ ] **GET /api/gsc/properties**
  - [ ] Response time: ___ ms
  - [ ] Data fetched from Google: ___ ms

- [ ] **POST /api/gsc/sync (manual)**
  - [ ] Sync duration for 100 keywords: ___ ms
  - [ ] Sync duration for 500 keywords: ___ ms

- [ ] **GET /api/sites**
  - [ ] 1 site: ___ ms
  - [ ] 5 sites: ___ ms

- [ ] **GET /api/health**
  - [ ] Response time: < 50 ms

### Chart Performance

- [ ] **Traffic Chart (90 days)**
  - [ ] Renders in < 1 second
  - [ ] Smooth on hover
  - [ ] No jank when scrolling
  - [ ] Responsive (resize window, redraws smoothly)

### Database Performance

- [ ] **Keyword insert (bulk upsert)**
  - [ ] 100 keywords: ___ ms
  - [ ] 500 keywords: ___ ms
  - [ ] 1000 keywords: ___ ms

- [ ] **Keyword query (latest 28 days)**
  - [ ] Returns in < 100 ms
  - [ ] Uses proper indexes

- [ ] **Page query (latest 28 days)**
  - [ ] Returns in < 100 ms
  - [ ] Uses proper indexes

---

## Build & Deployment Verification (T9.4)

### Production Build ✅
```bash
npm run build
```
- [ ] Build completes without errors
- [ ] Build size reasonable (< 500MB)
- [ ] No TypeScript errors
- [ ] No unused imports

### Docker Build ✅
```bash
docker compose build
```
- [ ] Build succeeds
- [ ] Image size < 500MB
- [ ] Multi-stage build works
- [ ] Final image is minimal

### Docker Startup ✅
```bash
docker compose up
```
- [ ] Database starts first
- [ ] App waits for database healthcheck
- [ ] App starts after database is ready
- [ ] Migrations run automatically
- [ ] App is healthy (healthcheck passes)
- [ ] App accessible at http://localhost:3000

### Full E2E Flow ✅
1. Docker stack starts
2. Log in with Google
3. Add GSC site
4. Data syncs
5. Dashboard shows metrics
6. Tables show keywords/pages
7. Can navigate between tabs
8. Can switch sites
9. Sign out works
10. Log in again works

---

## Success Criteria

Phase 1 is **COMPLETE** when:

✅ All manual tests pass (T9.1)
✅ All edge cases handled (T9.2)
✅ Performance baselines recorded (T9.3)
✅ Build and Docker verified (T9.4)
✅ <5 critical bugs open
✅ <10 total GitHub issues open
✅ Code builds without warnings
✅ All routes respond correctly
✅ No TypeScript errors
✅ Responsive design works
✅ OAuth flow complete
✅ Multi-site support working
✅ Data sync functional
✅ Dashboard displays correctly
✅ Tables sortable/filterable
✅ Documentation complete

---

## Known Limitations (Phase 1)

- No crawler (Phase 2)
- No Core Web Vitals (Phase 3)
- No alerts (Phase 4)
- No CSV export (Phase 5)
- No historical trend analysis beyond 28 days
- No custom date range selection
- No real-time updates (polls on page load only)

---

## Post-Launch Monitoring

After deployment, monitor:

- [ ] Error logs (sentry/datadog)
- [ ] Database query performance
- [ ] API response times
- [ ] Page load metrics (Core Web Vitals)
- [ ] User authentication failures
- [ ] GSC sync failures
- [ ] OAuth token refresh issues

---

## Regression Testing

Before each Phase release:

- [ ] All Phase 1 tests still pass
- [ ] Existing features not broken
- [ ] Database migrations work
- [ ] OAuth still works
- [ ] Multi-site navigation works
- [ ] Tables still sort/filter
- [ ] Dashboard still shows correct metrics
