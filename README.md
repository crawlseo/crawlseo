<div align="center">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/crawlseo-lockup-on-dark.svg" />
    <img src="docs/brand/crawlseo-lockup.svg" alt="crawlseo" height="44" />
  </picture>
</h1>

### Open-source SEO monitoring for founders, not SEO specialists

Google Search Console, a site crawler, Core Web Vitals and an MCP server in one self-hosted dashboard. Free and open source (MIT).

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

| | crawlseo |
|---|---|
| **Price** | Free and open source (MIT) |
| **Self-hosted** | ✅ Runs on your server, with Docker Compose or manually |
| **Database** | On your machine (your own PostgreSQL) |
| **GSC integration** | ✅ |
| **Site crawler** | ✅ Up to 2,000 pages per crawl by default (`CRAWL_MAX_PAGES`) |
| **Core Web Vitals** | ✅ |
| **MCP server** | ✅ Read-only: no tool writes, changes, queues or triggers anything |
| **Keyword research** | ✅ (BYOK) |
| **Backlinks** | ✅ (BYOK) |

> **BYOK** = Bring Your Own Key. Keyword research and backlink data use DataForSEO (optional). Google Autocomplete suggestions work as a free fallback.

In **Domain overview**, enter a competitor's domain or full website URL and choose **Compare** to query DataForSEO for that domain. Search Console fallback data is only used for your own site; unavailable competitor metrics are shown as unavailable.

## Your data stays yours

crawlseo runs on your server. Your sites, keywords, crawl results and Google tokens stay in your database. We never receive them, and the app sends no usage statistics.

The app talks to outside services only in these cases:

| Destination | When | What is sent | How to turn it off |
|---|---|---|---|
| Google (sign-in, Search Console, PageSpeed Insights) | When you sign in, connect Google, add a site or sync, run a vitals or index status check, or disconnect Google. Also on the schedule: a GSC sync per site each day and a vitals check per site each week, or as often as you set in Settings > Schedule | Requests for your own properties and pages | Don't run syncs, vitals or index status checks, or disconnect Google in Settings > Connections. For the schedule: vitals checks Off in Settings > Schedule, `SCHEDULE_GSC_SYNC_HOURS=0`, `SCHEDULE_VITALS_DAYS=0` or `SCHEDULER_ENABLED=false` |
| Bing Webmaster Tools | Only if you add your own Bing API key; then also a sync per site each day | Requests for your own Bing sites | Remove the key in Settings > Connections, or `SCHEDULE_BING_SYNC_HOURS=0` |
| DataForSEO | Only if you add your own DataForSEO key | The keyword and domain queries you run | Remove the key in Settings > Connections |
| Google autocomplete | Keyword suggestions when DataForSEO is not set up | The seed keyword you typed | Don't use keyword suggestions |
| Sites you crawl | When you start a crawl, and on the schedule a crawl of each site each week, or as often as you set in Settings > Schedule (Docker) | Normal HTTP requests from your server, to the site and to the addresses its redirects point to | Don't start a crawl; for the schedule: crawls Off in Settings > Schedule, `SCHEDULE_CRAWL_DAYS=0` or `SCHEDULER_ENABLED=false` |
| Your alert webhook | Only if you set a webhook URL in Settings > Alert webhook: when alerts fire, and when you click Send test | A signed JSON POST with the alerts that fired (type, message, site id and domain), to your own URL only | Remove the webhook in Settings; `ALERT_WEBHOOKS_ENABLED=false` turns webhooks off for the whole instance |
| Your SMTP server | Only if the operator sets `SMTP_HOST` and `SMTP_FROM` and you turn on Settings > Email alerts: when alerts fire, and when you click Send test | An email with the alerts that fired (type, message and domain, plain text and simple HTML, no tracking, links only to this instance), through the SMTP server the operator set, to the addresses you entered | Turn off Email alerts in Settings; `ALERT_EMAILS_ENABLED=false` or no `SMTP_HOST` turns email off for the whole instance |
| GitHub releases API | Once a day | A request for the latest crawlseo release. No data about you or your instance. GitHub sees your server's IP address | `CRAWLSEO_UPDATE_CHECK=false` |

Nothing else leaves your server. Alerts are shown in the app, sent to your webhook if you set one, and emailed through the operator's own SMTP server if you turn that on. Nothing goes through a crawlseo service.

The hosts behind these rows are `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com`, `searchconsole.googleapis.com`, `ssl.bing.com`, `api.dataforseo.com`, `suggestqueries.google.com` and `api.github.com`, plus the sites you crawl, the webhook URL you set yourself and the SMTP server the operator sets in `SMTP_HOST`. The list the tests check new code against is [`outbound-hosts.json`](outbound-hosts.json). Your Google profile picture, if you have one, is loaded by your browser from Google, not by the server.

## Features

### 🔍 GSC Analytics

Keywords, pages, clicks, impressions, position tracking with 28-day comparison and delta indicators.

<p align="center">
  <img src="docs/screenshots/keywords.png" alt="Keywords: GSC analytics" width="800" />
  <br />
  <em>Top keywords with position badges, clicks, impressions, and CTR</em>
</p>

### 🕷️ Site Crawler

Crawl up to 2,000 pages by default (`CRAWL_MAX_PAGES` sets the server's limit) with concurrent fetching. Health score, 16 issue types, content scoring, and remediation guidance.

The crawler (`CrawlSEOBot/1.0 (+https://crawlseo.cloud/bot)`) follows robots.txt per RFC 9309: each host (the bare domain and www included) is checked against its own robots.txt, redirect targets are checked before they are followed, a robots.txt that answers 429 or 5xx, times out or fails with a network error skips that host, and Crawl-delay is honoured. The crawl page lists what robots.txt kept it from.

Pages marked noindex are crawled but not scored. A page counts as noindex when a `<meta name="robots">` or `<meta name="googlebot">` tag, or the `X-Robots-Tag` response header (for all crawlers or `googlebot:`), says `noindex` or `none`; directives for other crawlers are ignored, and when the tag and the header disagree, noindex wins. Its links are still followed (`noindex, follow` is common), but it has no issues and does not count toward the health score, the issue counts or the content average, in the app, in `/api/v1` and in the MCP tools. The crawl page shows how many there were and a noindex filter on the crawled pages, so an accidental noindex is easy to spot. A broken page is still reported as broken, noindex or not. Crawls from before this change keep the score they were given.

<p align="center">
  <img src="docs/screenshots/audit.png" alt="Crawl / Audit" width="800" />
  <br />
  <em>Crawl results with health score, issue breakdown, and per-page audit data</em>
</p>

### 🤖 MCP server: AI agent integration

9 read-only tools for AI agents such as Claude Code, over HTTP at `/mcp` or over stdio, with access keys from Settings. Query your Search Console data, crawl issues, Core Web Vitals and opportunities without leaving the terminal. See [MCP](#mcp).

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
| 🔔 | **Alerts** | Traffic drops, position drops, low crawl health, sites that are mostly noindex and degraded vitals. Checked after each sync and crawl and when you press Evaluate now, shown in the app, and sent to your [webhook](#alert-webhooks) and [email](#alert-emails) if you set them up |
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

## MCP

crawlseo has an MCP (Model Context Protocol) server, so an AI agent such as Claude Code can read your SEO data.

**The MCP is read-only.** Its tools read your data and nothing else: no tool writes, changes, queues or triggers anything. There is no `run_crawl` and no sync; crawls and syncs start in the app or on the schedule. Every tool reads through your instance's API (`/api/v1`) with an access key, never from the database, and a key sees the sites of its own account only.

### Create a key

1. Open **Settings > MCP** in crawlseo and choose **Turn on**. MCP is off until you do, and while it is off every key is refused.
2. Give the key a name and choose **Create key**. Copy the key: it is stored hashed and shown only once.
3. The list shows when each key was last used. **Revoke** stops a key at once.

### Connect Claude Code

Over HTTP, to your instance's `/mcp` endpoint:

```bash
claude mcp add --transport http crawlseo https://seo.example.com/mcp --header "Authorization: Bearer <key>"
```

Or over stdio with the `@crawlseo/mcp` package, against your instance:

```bash
claude mcp add crawlseo -e CRAWLSEO_URL=http://localhost:3000 -e CRAWLSEO_API_KEY=<key> -- npx -y @crawlseo/mcp
```

Replace `https://seo.example.com` and `http://localhost:3000` with your instance's address. `/mcp` refuses a request without a key, with a wrong key or with a revoked key (401), and every key while MCP is off for that account (403). `/health` answers without a key. Each key may make `API_RATE_LIMIT_PER_MINUTE` requests a minute to `/mcp` and `/api/v1` together (default 60); a tool call counts once. The package also has an HTTP mode; see [`packages/mcp`](packages/mcp/README.md).

Tested end to end with Claude Code.

### Tools

| Tool | What it reads |
|---|---|
| `list_sites` | Your sites with their IDs and Search Console properties |
| `get_site_overview` | Clicks, impressions, position and CTR over 28 days against the 28 before, the latest crawl and vitals |
| `get_keywords` | Top Search Console queries, for the last N days or a date range |
| `get_pages` | Top pages, for the last N days or a date range |
| `get_traffic` | Daily clicks and impressions, for the last N days or a date range |
| `list_crawls` | The latest crawls with status, pages, issues and health score |
| `get_crawl_issues` | Issues of a crawl (the latest completed one by default), by severity |
| `get_vitals` | Core Web Vitals reports: performance score, LCP, CLS, INP, TTFB |
| `get_opportunities` | Striking distance, low CTR, content decay and cannibalization |

The MCP talks only to your own instance, so it adds no outside service to [Your data stays yours](#your-data-stays-yours).

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

Compose starts three services from that image: `app` (the web app), `worker`
and `db`. The app queues crawls, vitals checks and syncs; the worker runs them,
plus the schedule below, so a long crawl never slows the web app down. See
[Background jobs](#background-jobs).

Image tags:

| Tag | What it is |
|---|---|
| `latest` | The latest release. Moves only when a version is tagged. |
| `0.3.4`, `0.3` | A release, and the newest patch of a minor version. |
| `edge` | The latest build of `main`, ahead of the last release. |
| `sha-<commit>` | One exact build, for main pushes and releases. |

To pin a release, follow `main`, or use an image from a fork, set
`CRAWLSEO_IMAGE` in `.env`:

```bash
CRAWLSEO_IMAGE=ghcr.io/crawlseo/crawlseo:0.3.4
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

**5. Close registration.** Sign in once with your own Google account, then set `DISABLE_REGISTRATION=true` in `.env` and recreate the app container with `docker compose up -d --force-recreate app` (`docker compose restart` does not reread `.env`). From then on only accounts that already signed in can log in. Without it, anyone with a Google account can sign up on your instance and run crawls from your server. A refused account sees "This instance is not accepting new accounts. Ask its owner to sign you up."; set `REGISTRATION_CLOSED_MESSAGE` to say something else, such as where to ask for access.

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

`npm start` runs jobs in the app process (`WORKER_MODE=inline`, the default).
To run them in a separate process instead, set `WORKER_MODE=off` for the app
and run `npm run build:worker` once, then `WORKER_MODE=worker node dist/worker.cjs`
next to it.

### Background jobs

Crawls, vitals checks, GSC and Bing syncs and alert evaluation run as jobs in a
queue in your Postgres database. A job that fails for a reason a retry can fix
(a timeout, a network error) is retried after 1, 5 and 25 minutes. One that
cannot be fixed by waiting (an expired Google connection, a missing key, an
exhausted PageSpeed quota) fails at once with its reason. The buttons show
when a job is queued, running or waiting to retry.

**Who runs the jobs** is set by `WORKER_MODE`:

| Setup | App | Worker |
|---|---|---|
| Docker Compose from this repository (recommended) | `off` | `worker` service, `node worker.cjs` |
| One container, or `npm start` | `inline` (the default): the app runs them | none |
| Vercel | `inline`: see [Vercel](#vercel) | none |

An install upgraded from 0.2.x with its old `docker-compose.yml` keeps working
without changes: the app has no `WORKER_MODE`, so it runs the jobs itself, as
it ran crawls before. To move to the worker, take the `worker` service and the
app's `WORKER_MODE: "off"` line from the current `docker-compose.yml`. If the
worker is not running, the buttons say that queued jobs are not being picked up.

On `docker compose stop` (SIGTERM) the worker lets a running sync finish
(up to `WORKER_SHUTDOWN_GRACE_SECONDS`, 25 s by default) and puts a running
crawl back in the queue; it starts again when the worker does. A job whose
process died without stopping is taken back after `JOB_STALE_SECONDS`.

**The schedule.** For every site the app queues a GSC sync and, with a Bing
property and key, a Bing sync each day, then an alert evaluation after each
sync. Each site also gets a crawl (with the page count of its last crawl) and a
vitals check each week. After an upgrade, for a new site, or when crawls or
vitals checks are turned on (or a worker is added to a Vercel database), the
first scheduled crawl and vitals check are spread over the first week, never
sooner than a week after the site's last crawl or check, so none of these
crawls every site at once. Set the intervals with the `SCHEDULE_*` variables (0 turns
one off), or turn the schedule off with `SCHEDULER_ENABLED=false`; the buttons
keep working either way.

Each user can change the crawl and vitals intervals of their own sites in
**Settings > Schedule**: the server default, off, or every 1, 3, 7, 14 or 28
days. A change applies from the next scheduling pass (within 10 minutes),
measured from the site's last crawl or check. The `SCHEDULE_*` values are the
default for everyone who sets nothing, and a type the server turns off
(`SCHEDULE_CRAWL_DAYS=0`, `SCHEDULE_VITALS_DAYS=0` or `SCHEDULER_ENABLED=false`)
stays off whatever a user set. Scheduled crawls and vitals checks need the
worker or an app in inline mode, so on Vercel these settings apply only when a
worker is connected to the same database.

### Alert webhooks

Alerts are checked after each GSC or Bing sync, after each crawl and when you
click Evaluate now on a site's Alerts page. To get the ones that fire outside the app, set a
webhook in **Settings > Alert webhook**: a URL of your own (n8n, Zapier, Make, a
small script) and a signing secret of at least 16 characters (Generate makes
one; copy it before you save, it is not shown again). **Send test** sends one
`test` event with the values in the form and shows what your endpoint answered.

Each delivery is a JSON POST:

```json
{
  "event": "alert.fired",
  "id": "cmh0c9x2k0001",
  "firedAt": "2026-10-19T05:02:11.000Z",
  "site": { "id": "cmgz...", "domain": "example.com" },
  "alerts": [
    {
      "id": "cmgy...",
      "type": "TRAFFIC_DROP",
      "message": "Traffic drop on example.com: clicks -34.2% vs prior week",
      "previousFiredAt": null
    }
  ],
  "url": "https://seo.example.com/sites/cmgz.../alerts",
  "crawlseo": { "version": "0.3.4" }
}
```

`url` is set when `NEXTAUTH_URL` is. All alerts of one site from one
evaluation come in one delivery. An alert that keeps firing (a traffic drop
lasts days) is sent again at most once a day.

Headers:

| Header | Value |
|---|---|
| `X-Crawlseo-Event` | `alert.fired` or `test` |
| `X-Crawlseo-Delivery` | The delivery id, the same on every retry: use it to drop duplicates |
| `X-Crawlseo-Timestamp` | Unix time in seconds when this attempt was signed |
| `X-Crawlseo-Signature` | `sha256=` and the hex HMAC-SHA256 of `<timestamp>.<raw body>` with your secret |

To verify a delivery, compute the HMAC over the raw body before parsing it,
compare in constant time and refuse old timestamps:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody, headers, secret) {
  const timestamp = headers["x-crawlseo-timestamp"];
  const expected = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const given = Buffer.from(headers["x-crawlseo-signature"] ?? "");
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return fresh && given.length === expected.length && timingSafeEqual(given, Buffer.from(expected));
}
```

Answer with any 2xx status. A network error, a timeout (10 s), or HTTP 408,
425, 429 or 5xx is retried after about 1, 5, 25 and 60 minutes; after the
fifth attempt the delivery fails. Any other status fails it at once, and
redirects are not followed (set the final URL). Settings shows the last
delivery and its error. On Vercel a failed delivery is retried in the same
request after 2, 10 and 30 seconds, then at the next cron run.

**Where webhooks may go.** The URL is checked with the same guard as the
crawler, on save and again on every connection, so a name that resolves to a
private, loopback, link-local or reserved address is refused, also when its
DNS answer changes later. For a receiver on your own network, such as n8n in
the same Docker network (`http://n8n:5678/webhook/...`), the operator sets
`ALERT_WEBHOOK_ALLOW_PRIVATE=true`. That allows 10/8, 172.16/12, 192.168/16,
100.64/10, loopback and fc00::/7; link-local addresses (including the cloud
metadata address 169.254.169.254) and reserved ranges stay blocked. It is a
server setting, not a per-user one, so on a shared instance users cannot reach
the server's network unless you allow it. `ALERT_WEBHOOKS_ENABLED=false` turns
webhooks off for the instance.

### Alert emails

The same alerts that reach the webhook can be emailed, through an SMTP server
the operator of the instance sets up. crawlseo sends no email through any
service of its own: without SMTP settings, nothing is emailed.

The operator sets these in the environment (`.env` with Docker) and restarts
the app:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587          # default 587, or 465 with SMTP_SECURE=true
SMTP_SECURE=false      # true: TLS from the start (port 465); false: STARTTLS when offered
SMTP_USER=alerts@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM="crawlseo <alerts@example.com>"
```

`SMTP_HOST` and `SMTP_FROM` are required; leave `SMTP_USER` out for a server
that takes mail without a login. Any SMTP server works: your mail provider's,
a transactional email service or a relay on your own network. Many providers
want an app password or an API key as `SMTP_PASSWORD` rather than your account
password, and a sender address on a domain they verified; their SMTP
documentation names the host, port and TLS mode. The login stays in the
environment: it is never stored in the database, never returned by an API,
never shown in Settings and never logged (errors are shown without it).

Each user then opens **Settings > Email alerts**, enters up to 5 addresses,
turns on **Email fired alerts** and saves. **Send test** sends one test
email to the addresses in the form and shows the SMTP server's answer.

All alerts of one site from one evaluation come in one email, plain text plus
simple HTML, with no tracking pixel, no remote image and no link except to
this instance (when `NEXTAUTH_URL` is set). An alert that keeps firing is
emailed again at most once a day, as with webhooks. Sending is best effort
and never holds up a crawl, a sync or an alert evaluation: a network error, a
timeout (10 s for each step: DNS, connect, greeting, each answer) or a temporary SMTP answer (4xx) is retried after about 1 and
5 minutes (on Vercel within the request, then at the next cron run), any
other failure ends it at once, and Settings shows the last
email and its error. `ALERT_EMAILS_ENABLED=false` turns alert emails off for
the instance.

### Vercel

There is no long-running process on Vercel, so:

- A button runs its job in the same request after the response, within the
  route's time limit. A sync whose attempt fails for a reason a retry can fix
  is tried again in that request while time is left; if it still fails, the
  button shows when the next attempt is due and offers Retry. A crawl or
  vitals check that fails or is cut off fails with its reason; run it again
  with its button. The routes set `maxDuration = 300`, the most the Hobby plan
  allows ([function duration limits](https://vercel.com/docs/functions/configuring-functions/duration)).
  A crawl stops at that limit and keeps the pages it reached, so large crawls
  are cut short on Vercel; use Docker for them.
- `vercel.json` adds a [cron job](https://vercel.com/docs/cron-jobs) that calls
  `/api/cron/tick` once a day. It queues and runs the daily syncs and alert
  evaluation. Scheduled crawls and vitals checks need the worker, so they run
  on Docker only.
- Set `CRON_SECRET` (a random string of at least 16 characters) in the project's
  environment variables. Vercel sends it with every cron request and the route
  refuses requests without it ([securing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)).
- The Hobby plan runs cron jobs at most once a day, at some point within the
  scheduled hour ([cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)).
  On Pro you can change the schedule in `vercel.json` to run more often, for
  example `*/15 * * * *`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Session key, also encrypts stored API keys and Google tokens (`openssl rand -hex 32`). Keep it stable. `AUTH_SECRET` works as an alias |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `NEXTAUTH_URL` | No | Public base URL of the app, e.g. `https://seo.example.com`. Set it on a server; locally the request host is used |
| `DISABLE_REGISTRATION` | No | Set to `true` to close sign-up: a Google account that has never signed in on this instance is refused, while accounts that already signed in keep signing in |
| `REGISTRATION_CLOSED_MESSAGE` | No | What the login page tells an account that registration refused. Plain text, at most 200 characters, shown as text (no HTML). Unset or blank keeps the default line |
| `CRAWLSEO_HIDE_CLOUD_PROMO` | No | Set to `true` to remove the crawlseo.cloud card from the sidebar |
| `CRAWLSEO_UPDATE_CHECK` | No | Set to `false` to turn off the daily update check: no request to GitHub is made and the sidebar shows no update notice |
| `CRAWL_MAX_MINUTES` | No | Time limit of one crawl in minutes (default `30`). A host whose Crawl-delay does not fit in it is stopped early, with a message on the crawl page |
| `CRAWL_MAX_PAGES` | No | Most pages one crawl may fetch (default `2000`). The server applies it to every crawl, from the web app and from the schedule, whatever page count the request asks for |
| `API_RATE_LIMIT_PER_MINUTE` | No | Requests per minute one access key may make to `/mcp` and the read-only API (`/api/v1`) together (default `60`). Counted per process |
| `WORKER_MODE` | No | Who runs queued jobs: `inline` (default, the app process), `off` (this process only queues), `worker` (the worker process). See [Background jobs](#background-jobs) |
| `WORKER_LONG_CONCURRENCY` | No | Crawls and vitals checks one process runs at once (default `1`) |
| `WORKER_SHORT_CONCURRENCY` | No | Syncs and alert evaluations one process runs at once (default `2`) |
| `WORKER_POLL_SECONDS` | No | How often an idle process looks for queued jobs (default `5`) |
| `WORKER_SHUTDOWN_GRACE_SECONDS` | No | How long the worker lets running syncs finish on SIGTERM (default `25`). Keep it below the container's stop timeout |
| `JOB_STALE_SECONDS` | No | A running job whose process sent no heartbeat for this long is taken back (default `180`) |
| `JOB_RETENTION_DAYS` | No | Finished jobs are deleted after this many days (default `30`) |
| `SCHEDULER_ENABLED` | No | Set to `false` to stop all scheduled jobs. Buttons keep working |
| `SCHEDULE_GSC_SYNC_HOURS` | No | Hours between GSC syncs of a site (default `24`, `0` turns them off) |
| `SCHEDULE_BING_SYNC_HOURS` | No | Hours between Bing syncs of a site (default `24`, `0` turns them off) |
| `SCHEDULE_CRAWL_DAYS` | No | Days between scheduled crawls of a site (default `7`, `0` turns them off). Each user can set their own interval in Settings > Schedule; `0` here keeps crawls off for everyone. Docker only |
| `SCHEDULE_VITALS_DAYS` | No | Days between scheduled vitals checks of a site (default `7`, `0` turns them off). Each user can set their own interval in Settings > Schedule; `0` here keeps them off for everyone. Docker only |
| `ALERT_WEBHOOKS_ENABLED` | No | Set to `false` to turn alert webhooks off for the instance: nothing is sent and Settings shows no webhook form. See [Alert webhooks](#alert-webhooks) |
| `ALERT_WEBHOOK_ALLOW_PRIVATE` | No | Set to `true` to let webhooks reach private networks (10/8, 172.16/12, 192.168/16, 100.64/10, loopback, fc00::/7), for a receiver on your own network. Link-local and reserved addresses stay blocked. Default: public addresses only. See [Alert webhooks](#alert-webhooks) |
| `SMTP_HOST` | No | Your SMTP server. With `SMTP_FROM`, turns on alert emails. See [Alert emails](#alert-emails) |
| `SMTP_PORT` | No | SMTP port (default `587`, or `465` when `SMTP_SECURE=true`) |
| `SMTP_SECURE` | No | `true`: TLS from the start (port 465). `false`: plain, then STARTTLS when the server offers it. Default: `true` on port 465, otherwise `false` |
| `SMTP_USER` | No | SMTP login. Leave unset for a server that takes mail without one |
| `SMTP_PASSWORD` | No | SMTP password or app password. Kept in the environment only: never stored, shown or logged |
| `SMTP_FROM` | No | Sender of alert emails, e.g. `crawlseo <alerts@example.com>`. Required for email |
| `ALERT_EMAILS_ENABLED` | No | Set to `false` to turn alert emails off for the instance: nothing is sent and Settings shows no email form. See [Alert emails](#alert-emails) |
| `CRON_SECRET` | Vercel | Protects `/api/cron/tick`. Without it the route refuses every request |

### The crawlseo.cloud card

The sidebar shows one card about [crawlseo.cloud](https://crawlseo.cloud), the hosted AI visibility product from the same team. It is a plain link to the crawlseo.cloud home page with `utm_source=oss` in the URL (plus `utm_medium=app` and `utm_campaign=sidebar`). The app makes no request for it, loads no image and reports nothing about it. Each user can hide it with the × button (remembered in that browser), and `CRAWLSEO_HIDE_CLOUD_PROMO=true` removes it for everyone on the instance.

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

Self-hosted SEO tools should be free and open source. Your data stays on your server.

</div>
