# Changelog

Notable changes per release. Releases before 0.3.3 are described on the
[releases page](https://github.com/crawlseo/crawlseo/releases).

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
