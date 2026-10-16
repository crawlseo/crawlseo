<div align="center">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/crawlseo-lockup-on-dark.svg" />
    <img src="docs/brand/crawlseo-lockup.svg" alt="crawlseo" height="44" />
  </picture>
</h1>

### Open-source SEO monitoring for founders, not SEO specialists

Google Search Console, a site crawler, Core Web Vitals and an MCP server in one self-hosted dashboard. Free forever.

[![GitHub stars](https://img.shields.io/github/stars/crawlseo/crawlseo?style=flat-square)](https://github.com/crawlseo/crawlseo/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)
[![Docker](https://img.shields.io/badge/docker-ready-blue?style=flat-square&logo=docker)](docker-compose.yml)

</div>

---

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="crawlseo overview with Quilltab sample data" width="800" />
</p>

## Why crawlseo?

| | crawlseo | OpenSEO | Ahrefs | Semrush | Moz |
|---|:---:|:---:|:---:|:---:|:---:|
| **Price** | **Free** | $10/mo | €119/mo | $139/mo | $49/mo |
| **Self-hosted** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **GSC integration** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Site crawler** | ✅ (2000 pages) | ✅ | ✅ | ✅ | ✅ |
| **Core Web Vitals** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **MCP Server** | ✅ (10 tools) | ✅ (24 tools) | ❌ | ❌ | ❌ |
| **AI agent ready** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Keyword Research** | ✅ (BYOK) | ✅ | ✅ | ✅ | ✅ |
| **Backlinks** | ✅ (BYOK) | ✅ | ✅ | ✅ | ✅ |
| **Open source** | ✅ MIT | ✅ | ❌ | ❌ | ❌ |
| **Your data stays yours** | ✅ | ✅ | ❌ | ❌ | ❌ |

> **BYOK** = Bring Your Own Key. Keyword research and backlink data use DataForSEO (optional). Google Autocomplete suggestions work as a free fallback.

In **Domain overview**, enter a competitor's domain or full website URL and choose **Compare** to query DataForSEO for that domain. Search Console fallback data is only used for your own site; unavailable competitor metrics are shown as unavailable.

## Features

### 🔍 GSC Analytics

Keywords, pages, clicks, impressions, position tracking with 28-day comparison and delta indicators.

<p align="center">
  <img src="docs/screenshots/keywords.png" alt="Keywords: GSC analytics" width="800" />
  <br />
  <em>Top keywords with position badges, clicks, impressions, and CTR</em>
</p>

### 🕷️ Site Crawler

Crawl up to 2,000 pages with concurrent fetching. Health score, 16 issue types, content scoring, and remediation guidance.

The crawler (`CrawlSEOBot/1.0 (+https://crawlseo.cloud)`) follows robots.txt per RFC 9309: each host (the bare domain and www included) is checked against its own robots.txt, redirect targets are checked before they are followed, a robots.txt that answers 429 or 5xx, times out or fails with a network error skips that host, and Crawl-delay is honoured. The crawl page lists what robots.txt kept it from.

<p align="center">
  <img src="docs/screenshots/audit.png" alt="Crawl / Audit" width="800" />
  <br />
  <em>Crawl results with health score, issue breakdown, and per-page audit data</em>
</p>

### 🤖 MCP server: AI agent integration

10 tools for Claude Code, Claude Desktop, and Cursor. Query your SEO data, run crawls, and find opportunities without leaving the terminal.

<p align="center">
  <img src="docs/screenshots/mcp.png" alt="AI & MCP" width="800" />
  <br />
  <em>MCP setup page with connection config, setup guides, and available tools</em>
</p>

### More features

| | Feature | Description |
|---|---|---|
| ⚡ | **Core Web Vitals** | LCP, CLS, INP, TTFB via PageSpeed Insights with mobile/desktop comparison |
| 🔑 | **Keyword Research** | DataForSEO-powered keyword ideas with volume, difficulty, CPC. Free Google Autocomplete fallback |
| 🔗 | **Backlinks** | Backlink profile, referring domains, anchor text, dofollow/nofollow analysis |
| 📊 | **Rank Tracking** | Historical position snapshots with saved keywords and notes |
| 💡 | **SEO Opportunities** | Striking distance keywords, low CTR, content decay, cannibalization detection |
| 🔔 | **Alerts** | Traffic drops, position drops, low crawl health and degraded vitals. Checked when you press Evaluate now on the Alerts page and shown in the app; nothing is sent by email or chat yet |
| 📥 | **CSV Export** | Export keywords and pages data for offline analysis |

GSC sync, crawls and Core Web Vitals checks run when you start them in the app. There is no built-in schedule yet.

## Quick Start

```bash
git clone https://github.com/crawlseo/crawlseo.git
cd crawlseo
cp .env.example .env.local
# Add your Google OAuth credentials to .env.local
docker compose up -d db
npm install
npx prisma migrate dev --name init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and add your first site.

<details>
<summary>🔑 Getting Google OAuth credentials</summary>

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select existing)
3. Enable the **Google Search Console API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy Client ID and Client Secret to `.env.local`

Required scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/webmasters.readonly`

</details>

## MCP server: AI agent integration

crawlseo includes a Model Context Protocol server so AI agents can query your SEO data directly.

Add to your Claude Code settings (`.claude/settings.json`):

```json
{
  "mcpServers": {
    "crawlseo": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "/path/to/crawlseo"
    }
  }
}
```

**10 tools available:**

| Category | Tools |
|---|---|
| **Sites** | `list_sites`, `get_site_overview` |
| **Keywords & Pages** | `get_keywords`, `get_pages`, `get_traffic` |
| **Crawl & Audit** | `run_crawl`, `get_crawl_status`, `get_crawl_issues` |
| **Performance** | `get_vitals`, `get_opportunities` |

Works with Claude Code, Claude Desktop, and Cursor. See [`mcp/README.md`](mcp/README.md) for full setup guide.

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) |
| **Database** | [PostgreSQL](https://www.postgresql.org/) |
| **ORM** | [Prisma](https://www.prisma.io/) |
| **Auth** | [NextAuth.js v5](https://authjs.dev/) |
| **UI** | [shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS v4](https://tailwindcss.com/) |
| **Charts** | Plain React + Tailwind (no chart library) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **MCP** | [@modelcontextprotocol/sdk](https://modelcontextprotocol.io/) |
| **Deployment** | Docker Compose |

## Self-Hosting

### Docker Compose (recommended)

```bash
git clone https://github.com/crawlseo/crawlseo.git
cd crawlseo
cp .env.example .env
# Edit .env with your credentials
docker compose pull
docker compose up -d
```

Compose pulls the prebuilt `ghcr.io/crawlseo/crawlseo:latest` image, so deployment
credentials are only needed at runtime. Images support `linux/amd64` and
`linux/arm64`, and database migrations run automatically when the container
starts.

Image tags:

| Tag | What it is |
|---|---|
| `latest` | The latest release. Moves only when a version is tagged. |
| `0.2.5`, `0.2` | A release, and the newest patch of a minor version. |
| `edge` | The latest build of `main`, ahead of the last release. |
| `sha-<commit>` | One exact build, for main pushes and releases. |

To pin a release, follow `main`, or use an image from a fork, set
`CRAWLSEO_IMAGE` in `.env`:

```bash
CRAWLSEO_IMAGE=ghcr.io/crawlseo/crawlseo:0.2.5
```

To build locally instead, build the same image name before starting Compose:

```bash
docker build -t crawlseo:local .
CRAWLSEO_IMAGE=crawlseo:local docker compose up -d
```

### Run on a server

The defaults above are for a local machine. On a server reachable from the internet, change these before you sign in.

**1. Publish the app port on loopback only.** In `docker-compose.yml`, change the app's port mapping:

```yaml
    ports:
      - "127.0.0.1:3000:3000"
```

Docker writes its own firewall rules for published ports, so they bypass host firewalls such as ufw. With the default `3000:3000` the app answers plain http on the server's public IP even if ufw blocks port 3000. On loopback only the reverse proxy on the same host can reach it.

**2. Put the app behind HTTPS with a reverse proxy.** A minimal [Caddy](https://caddyserver.com/) setup on the host, with your domain's DNS pointing at the server and ports 80 and 443 open (Caddy gets the certificate itself):

```
# /etc/caddy/Caddyfile
seo.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

**3. Set the public URL and the Google redirect URI.** In `.env`, set `NEXTAUTH_URL=https://seo.example.com` and keep `AUTH_TRUST_HOST=true`. In the Google OAuth client, add `https://seo.example.com/api/auth/callback/google` as an authorized redirect URI.

**4. Set your own database password.** Set `POSTGRES_PASSWORD` in `.env` before the first `docker compose up`; the default is `changeme`. Postgres keeps the password it was created with, so changing it later also means changing it inside the database.

**5. Close registration.** Sign in once with your own Google account, then set `DISABLE_REGISTRATION=true` in `.env` and recreate the app container with `docker compose up -d --force-recreate app` (`docker compose restart` does not reread `.env`). From then on only accounts that already signed in can log in. Without it, anyone with a Google account can sign up on your instance and run crawls from your server.

**6. Keep `NEXTAUTH_SECRET` stable.** It signs sessions and also encrypts stored API keys and Google tokens. If it changes, saved API keys become unreadable and users have to sign in with Google again.

### Manual

```bash
# Prerequisites: Node.js 20+, PostgreSQL

npm install
cp .env.example .env.local
# Configure .env.local

npx prisma migrate deploy
npm run build
npm start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Session key, also encrypts stored API keys and Google tokens (`openssl rand -hex 32`). Keep it stable. `AUTH_SECRET` works as an alias |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `NEXTAUTH_URL` | No | Public base URL of the app, e.g. `https://seo.example.com`. Set it on a server; locally the request host is used |
| `DISABLE_REGISTRATION` | No | Set to `true` to close sign-up: a Google account that has never signed in on this instance is refused, while accounts that already signed in keep signing in |
| `CRAWLSEO_HIDE_CLOUD_PROMO` | No | Set to `true` to remove the crawlseo.cloud card from the sidebar |
| `CRAWL_MAX_MINUTES` | No | Time limit of one crawl in minutes (default `30`). A host whose Crawl-delay does not fit in it is stopped early, with a message on the crawl page |

### The crawlseo.cloud card

The sidebar shows one card about [crawlseo.cloud](https://crawlseo.cloud), the hosted AI visibility product from the same team. It is a plain link to the crawlseo.cloud home page (with `utm_source=oss` in the URL): the app makes no request for it, loads no image and sends no analytics. Each user can hide it with the × button (remembered in that browser), and `CRAWLSEO_HIDE_CLOUD_PROMO=true` removes it for everyone on the instance.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
# Make your changes
git commit -m "feat: add your feature"
git push origin feature/your-feature
# Open a Pull Request
```

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

Built by [Brandson Digital](https://brandson.digital) · Created by [Mike](https://m1ke.digital)

Self-hosted SEO tools should be free. Your data should be yours.

</div>
