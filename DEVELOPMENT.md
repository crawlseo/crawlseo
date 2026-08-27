# CrawlSEO Development Guide

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (for PostgreSQL)
- Google OAuth credentials (from Google Cloud Console)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/crawlseo/crawlseo.git
   cd crawlseo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Google OAuth credentials
   ```

4. **Start the database**
   ```bash
   docker compose up -d db
   ```

5. **Initialize the database**
   ```bash
   npx prisma migrate dev --name init
   # This creates the database schema and Prisma Client
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

7. **Log in**
   - Click "Sign in with Google"
   - Use your Google account with access to Google Search Console

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/             # Login pages
│   ├── (dashboard)/        # Main app pages
│   ├── api/                # API routes
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page
├── components/
│   ├── ui/                 # shadcn/ui components
│   └── layout/             # Header, sidebar, footer
├── lib/
│   ├── db.ts               # Prisma Client
│   ├── utils.ts            # Shared utilities
│   ├── google/             # Google API clients
│   ├── crawler/            # Site crawler
│   └── alerts/             # Alert logic
├── workers/                # Background jobs
└── types/                  # TypeScript types
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Database

### PostgreSQL Setup

The project uses PostgreSQL with Prisma ORM.

**Start PostgreSQL with Docker:**
```bash
docker compose up -d db
```

**View database:**
```bash
docker compose exec db psql -U crawlseo -d crawlseo
```

### Prisma Commands

- `npx prisma generate` - Generate Prisma Client
- `npx prisma migrate dev` - Create and apply migrations
- `npx prisma studio` - Open Prisma Studio (web UI for database)

## Environment Variables

Copy `.env.example` to `.env.local` and update:

| Variable | Required | Purpose |
|----------|----------|---------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| APP_SECRET | Yes | NextAuth secret (use `openssl rand -hex 32`) |
| GOOGLE_CLIENT_ID | Yes | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | Yes | Google OAuth client secret |
| NEXTAUTH_URL | No | NextAuth URL (auto-detected in dev) |

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable these APIs:
   - Google Search Console API
   - URL Inspection API
   - PageSpeed Insights API
4. Create OAuth 2.0 credentials (Web application):
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
5. Copy Client ID and Client Secret to `.env.local`

## Bing Webmaster Tools Setup

Bing is optional and free. It reports queries, pages and crawl statistics that
Search Console either anonymises or does not expose at all.

1. Sign in at [Bing Webmaster Tools](https://www.bing.com/webmasters) and verify
   the site.
2. **Settings → API Access → API Key → Generate**. One key covers every verified
   site on the account, and generating a new one invalidates the old.
3. In CrawlSEO, open a site's **Settings → External API Keys → Bing Webmaster
   Tools**, paste the key and save. **Test Connection** calls `GetUserSites`,
   which costs nothing and needs no site.
4. Under **Bing Webmaster property**, pick the property for this site and sync.

The property URL often differs from the Search Console one — Bing may know
`https://example.com/` where Search Console knows `https://www.example.com/` —
so the two are stored separately.

Two things about Bing's data are worth knowing when reading the numbers:

- `GetQueryStats` and `GetPageStats` report **weekly** buckets ending on a
  Friday, and accept no date range: every call returns the full history. A
  window counts the buckets whose end date falls inside it, so its edges are
  approximate by up to six days. Site traffic and crawl stats are daily.
- In `GetCrawlStats`, only `CrawledPages` is a per-day count. The status fields
  are running snapshots of the URLs Bing knows in each state, so they are
  reported as a latest value plus its movement, never summed.

## Testing

### Manual Testing Checklist
- [ ] Login works with Google OAuth
- [ ] Can add a site from GSC properties
- [ ] Dashboard displays metrics
- [ ] Keywords table loads and sorts
- [ ] Site switcher works

### Run Tests (future)
```bash
npm run test
```

## Docker for Production

Build and run the full stack:
```bash
docker compose up --build
```

This starts:
- Next.js app on port 3000
- PostgreSQL on port 5432

## Troubleshooting

### Database connection failed
- Ensure PostgreSQL is running: `docker compose ps`
- Check DATABASE_URL in .env.local
- Verify credentials match docker-compose.yml

### Prisma Client not found
```bash
npx prisma generate
```

### Port 3000 already in use
```bash
lsof -i :3000
kill -9 <PID>
```

### OAuth not working
- Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local
- Check redirect URIs in Google Console match NEXTAUTH_URL

## Architecture

### Authentication
- NextAuth.js with Google OAuth
- Stores access/refresh tokens in User model
- Middleware protects dashboard routes

### GSC Data
- Synced daily via background job
- Stored in Keyword and Page models
- Indexed by (siteId, date) for fast queries

### Crawler (Phase 2)
- Fetches and parses HTML with cheerio
- Follows internal links up to depth 10
- Respects robots.txt directives
- Stores issues in CrawlIssue model

### Core Web Vitals (Phase 3)
- Fetches via PageSpeed Insights API
- Checks top 10 pages by traffic
- Mobile and Desktop variants

### Alerts (Phase 4)
- Evaluated after each sync/crawl
- Channels: Email, Telegram, Webhook, Slack
- Cooldown: 24 hours between same alert type

## Contributing

1. Create a feature branch
2. Follow the existing code style (ESLint)
3. Test your changes
4. Submit a PR

## License

MIT
