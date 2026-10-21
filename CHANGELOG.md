# Changelog

Notable changes per release. Releases before 0.3.3 are described on the
[releases page](https://github.com/crawlseo/crawlseo/releases).

## 0.3.4

### Added

- **A read-only MCP server on your instance.** AI agents can read your own
  Search Console data, crawl issues, Core Web Vitals and opportunities from
  your crawlseo instance. Tested end to end with Claude Code. Nine tools, none
  of which writes, changes, queues or triggers anything. See
  [MCP](README.md#mcp).
- **Settings > MCP.** Turn MCP on or off for your account (off by default),
  create access keys (shown once, stored hashed) and revoke them, with the
  time each key was last used.
- **`/mcp` on the instance:** MCP over streamable HTTP with
  `Authorization: Bearer <key>`, and `/health`. A request without a key, with
  a wrong or revoked key, or while MCP is off is refused.
- **`@crawlseo/mcp`** (`packages/mcp`): the same MCP server as a package, over
  stdio with `CRAWLSEO_URL` and `CRAWLSEO_API_KEY`, or over HTTP with `--http`.
- **A read-only API, `/api/v1`,** that the MCP server reads through: the key
  in use, sites, overview, keywords, pages and traffic (last N days or a date
  range), crawls, crawl issues, vitals and opportunities. GET only, a key sees
  its own account's sites only, `API_RATE_LIMIT_PER_MINUTE` per key across
  `/mcp` and `/api/v1` (default 60).

### Changed

- The MCP server is read-only and no longer connects to the database: every
  tool reads through `/api/v1` with a key. `run_crawl` and `get_crawl_status`
  are removed; crawls start in the app or on the schedule. `list_crawls` is
  new; keywords, pages and traffic take a date range.

### Upgrading

- The migrations that run when the container starts create the `AccessKey`
  table and add `mcpEnabled` to the `UserSettings` table. Nothing to set.
- MCP stays off until you turn it on in Settings > MCP, and while it is off
  every key is refused.
- A setup that ran `mcp/server.ts` with `DATABASE_URL` stops working: turn
  MCP on, create a key, and connect again with one of the commands in
  [MCP](README.md#mcp).
- No new outbound hosts: the MCP talks only to your own instance.

## 0.3.3

### Added

- **Settings > Schedule.** Each user sets how often their sites are crawled and
  get a vitals check: the server default, off, or every 1, 3, 7, 14 or 28 days.
  The `SCHEDULE_*` variables stay the default, and a type the server turns off
  stays off for everyone. Scheduled crawls and vitals checks still need the
  worker (Docker); Vercel cron is unchanged.
- **Alert webhooks.** Settings > Alert webhook takes a URL of your own and a
  signing secret. Fired alerts are sent as a JSON POST signed with
  HMAC-SHA256 (`X-Crawlseo-Signature`), retried after about 1, 5, 25 and 60
  minutes when the endpoint is down, and an alert that keeps firing is sent at
  most once a day. Send test checks the endpoint before you save. See
  [Alert webhooks](README.md#alert-webhooks).
- `ALERT_WEBHOOKS_ENABLED=false` turns webhooks off for the instance, and
  `ALERT_WEBHOOK_ALLOW_PRIVATE=true` lets them reach private networks (for a
  receiver such as n8n next to crawlseo). By default webhooks go to public
  addresses only, through the crawler's SSRF guard.
- For forks: `enqueueJob(..., { unique: false })` queues a job outside the one
  active job per type and site rule, and `followUps` may return a job with a
  payload.

### Changed

- The Alerts page says when alerts are checked and links to the webhook
  setting. Evaluate now also queues webhook deliveries.

### Upgrading

- A new table, `UserSettings`, is created by the migration that runs when the
  container starts. Nothing to set: without any setting the schedule and
  alerts work as in 0.3.2.
- The webhook is the only new outbound request, and it goes only to the URL a
  user sets. See "Your data stays yours" in the README.
