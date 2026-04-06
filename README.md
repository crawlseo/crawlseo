# CrawlSEO

**Open-source SEO monitoring for founders**

Google Search Console data + Site Crawler + Core Web Vitals in one dashboard. Self-hosted. Free forever.

> [!NOTE]
> **Phase 1 (Foundation) is complete** ✅
> - User authentication with Google OAuth
> - Multi-site GSC data sync
> - Dashboard with KPIs and traffic charts
> - Keywords and pages tables with sorting/filtering
> 
> **Phase 2-4** coming soon (crawler, Core Web Vitals, alerts, correlation view)

## Why CrawlSEO?

| | CrawlSEO | Ahrefs | Semrush | Moz | SEO Gets |
|---|---|---|---|---|---|
| **Price** | **Free** | €119/mo | $139/mo | $49/mo | $14/mo |
| **Self-hosted** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **GSC data** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Site crawler** | 🚧 Phase 2 | ✅ | ✅ | ✅ | ❌ |
| **Core Web Vitals** | 🚧 Phase 3 | ❌ | ✅ | ❌ | ❌ |
| **Open source** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Your data stays yours** | ✅ | ❌ | ❌ | ❌ | ❌ |

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone and navigate
git clone https://github.com/crawlseo/crawlseo.git
cd crawlseo

# Copy environment template and configure
cp .env.example .env.local
# Edit .env.local with your Google OAuth credentials

# Start with Docker
docker compose up

# Visit http://localhost:3000
```

Takes ~2 minutes to have the full stack running (database, Next.js app, migrations).

### Local Development

```bash
# Prerequisites: Node.js 20+, PostgreSQL running locally or via Docker

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your Google OAuth credentials

# Start database (if using Docker)
docker compose up -d db

# Initialize schema
npx prisma migrate dev

# Start dev server
npm run dev
```

Visit http://localhost:3000, sign in with Google, and add your first GSC property.

**Full setup guide**: See [DEVELOPMENT.md](./DEVELOPMENT.md)

## Features (Phase 1 ✅)

- ✅ **Google OAuth Authentication** - Secure login with Google
- ✅ **Multi-site Management** - Connect multiple GSC properties  
- ✅ **Automatic GSC Sync** - Daily keyword and page metrics
- ✅ **Dashboard Overview** - KPI cards with 28-day comparison
- ✅ **Traffic Trends** - 90-day line chart (clicks + impressions)
- ✅ **Keywords Table** - Top keywords with position, clicks, impressions, CTR
- ✅ **Pages Table** - Top pages with metrics
- ✅ **Site Switcher** - Quick access to multiple sites
- ✅ **Responsive Design** - Desktop and mobile friendly

## Coming Soon

**Phase 2: Crawler** (Week 3-4)
- [ ] Site crawler engine
- [ ] Technical SEO checks (meta tags, H1, images, schema, structured data)
- [ ] Health score calculation
- [ ] Crawl issues dashboard

**Phase 3: Core Web Vitals** (Week 5)
- [ ] PageSpeed Insights integration
- [ ] LCP, CLS, INP metrics
- [ ] Mobile vs Desktop comparison
- [ ] Performance trends

**Phase 4: Alerts & Insights** (Week 6)
- [ ] Alert rules (traffic drop, position change, 404s, vitals)
- [ ] Email, Telegram, Slack, Webhook notifications
- [ ] Correlation view (positions ↓ + vitals ↓ + crawl issues)

**Phase 5: Polish & Launch** (Week 7-8)
- [ ] CSV export
- [ ] Deploy buttons (Railway, Render, Fly.io)
- [ ] Landing page
- [ ] Public launch

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 14+ | Full-stack, SSR, proven at scale |
| **Language** | TypeScript | Type safety, better DX |
| **Database** | PostgreSQL | Universal, scalable analytics queries |
| **ORM** | Prisma | Best TS ORM, migrations, type generation |
| **Auth** | NextAuth.js | Google OAuth built-in, simple session management |
| **UI** | Tailwind CSS + shadcn/ui | Fast to build, component reuse |
| **Charts** | Recharts | React-native, simple API |
| **Deployment** | Docker Compose | Self-hosted, industry standard |

## Architecture

```
CrawlSEO (Next.js monorepo)
├── Frontend (React/Next.js)
│   ├── Authentication (Google OAuth)
│   ├── Dashboard (KPIs, charts, tables)
│   ├── Site Management (add/delete sites)
│   ├── Keywords Table (search, sort, filter)
│   ├── Pages Table (search, sort, filter)
│   └── Responsive UI (Tailwind + shadcn/ui)
│
├── Backend (Next.js API routes)
│   ├── Auth endpoints (/api/auth/*)
│   ├── Sites CRUD (/api/sites/*)
│   ├── GSC integration (/api/gsc/*)
│   └── Health check (/api/health)
│
├── Workers
│   ├── GSC sync (daily keywords + pages)
│   ├── Crawl engine (Phase 2)
│   ├── Vitals check (Phase 3)
│   └── Alert evaluation (Phase 4)
│
├── Database (PostgreSQL)
│   ├── Users & Sessions (auth)
│   ├── Sites & Properties (GSC config)
│   ├── Keywords & Pages (GSC data)
│   ├── Crawls & Issues (Phase 2)
│   ├── Vitals Reports (Phase 3)
│   └── Alerts (Phase 4)
│
└── External APIs (all free)
    ├── Google Search Console API
    ├── PageSpeed Insights API
    └── URL Inspection API
```

## Environment Setup

Create `.env.local` from `.env.example`:

```bash
# Database (required)
DATABASE_URL=postgresql://crawlseo:crawlseo@localhost:5432/crawlseo

# NextAuth (required)
APP_SECRET=<generate: openssl rand -hex 32>

# Google OAuth (required)
# Get from: https://console.cloud.google.com/
# Scopes: openid, email, profile, https://www.googleapis.com/auth/webmasters.readonly
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>

# Optional
NEXTAUTH_URL=http://localhost:3000
NODE_ENV=development
```

## Database Schema

**Key Tables:**
- **User** - Accounts with encrypted Google OAuth tokens
- **Site** - GSC properties connected by user
- **Keyword** - Search query metrics (clicks, impressions, position, CTR)
- **Page** - Page metrics aggregated by URL
- **Crawl** - Site crawl results with health score
- **CrawlIssue** - Technical issues found during crawl
- **VitalsReport** - Core Web Vitals and Lighthouse scores
- **Alert** - Alert rules for notifications

All models include proper indexing and cascade deletes. See [prisma/schema.prisma](./prisma/schema.prisma) for full schema.

## API Routes

**Auth** (NextAuth.js)
```
POST /api/auth/signin/google
GET  /api/auth/callback/google
POST /api/auth/signout
```

**Sites CRUD**
```
GET    /api/sites              # List user's sites
POST   /api/sites              # Create site
GET    /api/sites/[siteId]     # Get site details
PUT    /api/sites/[siteId]     # Update site
DELETE /api/sites/[siteId]     # Delete site (cascades)
```

**Google Search Console**
```
GET  /api/gsc/properties       # List GSC properties
POST /api/gsc/sync             # Trigger manual sync
```

**Health**
```
GET  /api/health               # Health check for Docker
```

All routes require authentication (OAuth session).

## Development

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm run start

# Lint code
npm run lint

# View database (Prisma Studio)
npx prisma studio

# Reset database (dev only)
npx prisma db push --skip-generate --force-reset
```

## Docker Deployment

The included `docker-compose.yml` runs the full stack:

```bash
# Build and start
docker compose up --build

# View logs
docker compose logs -f app
docker compose logs -f db

# Stop all services
docker compose down

# Remove database volume
docker compose down -v
```

The `Dockerfile` uses multi-stage builds:
1. **deps** - Install dependencies
2. **builder** - Build Next.js app
3. **runner** - Minimal production image

Migrations run automatically on startup. Database must be healthy before app starts.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit with conventional messages: `git commit -m 'feat: add feature'`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

See [DEVELOPMENT.md](./DEVELOPMENT.md) for local setup and testing.

## Troubleshooting

**Can't connect to database:**
```bash
docker compose ps              # Check if containers are running
docker compose logs db         # View database logs
docker compose restart db      # Restart database
```

**OAuth not working:**
1. Verify credentials in `.env.local`
2. Check Google Cloud Console redirect URI: `http://localhost:3000/api/auth/callback/google`
3. Ensure GSC scopes are enabled
4. Check browser console for errors

**No GSC data appearing:**
1. Verify account has GSC property access
2. Manually trigger sync via API: `POST /api/gsc/sync`
3. Check server logs and browser console

**Database migration failed:**
```bash
npx prisma migrate reset       # Reset and re-seed
npx prisma db push            # Push schema directly
```

## Roadmap & Status

- [x] Phase 1: Foundation (auth, GSC sync, dashboard, tables)
- [ ] Phase 2: Crawler (technical SEO, health score)
- [ ] Phase 3: Core Web Vitals (PageSpeed, trends)
- [ ] Phase 4: Alerts (multi-channel, correlation view)
- [ ] Phase 5: Polish (exports, landing page, launch)

See [PLAN.md](./PLAN.md) for detailed implementation plan.

## License

MIT License - see [LICENSE](./LICENSE) file

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/crawlseo/crawlseo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/crawlseo/crawlseo/discussions)
- **Email**: hello@crawlseo.dev
- **Twitter**: [@crawlseo](https://twitter.com/crawlseo)

## Credits

Built with ❤️ by [Brandson Digital](https://brandson.digital)

> Self-hosted SEO tools should be free. Your data should be yours.

**Special thanks to:**
- [Next.js](https://nextjs.org/) team
- [Prisma](https://prisma.io/) for amazing ORM
- [shadcn/ui](https://ui.shadcn.com/) for component library
- [Google](https://developers.google.com/) for free APIs
