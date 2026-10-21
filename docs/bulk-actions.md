# Bulk actions

**All sites** has a **Bulk actions** button beside **Add site**. Choose all
websites or a subset and select GSC, Bing, Crawl / Audit and PageSpeed. GSC is
selected by default. Crawl presets respect the server's `CRAWL_MAX_PAGES`
ceiling, up to 2,000 pages per website. PageSpeed checks 1, 3 or 5 top pages on
mobile, with the homepage as a fallback.

## Execution and hosting

Bulk actions require a **long-running web server**. The batch coordinator runs
in Next.js `after()` and will not complete reliably on serverless hosts such
as Vercel. Batch creation is disabled on Vercel. Even with a separate worker,
the web server must stay alive to coordinate the batch.

The coordinator queues one step at a time through the normal job APIs, then
waits for its result. `WORKER_MODE=inline` uses the app's existing job loop;
`WORKER_MODE=off` requires the separate worker to be running. No provider calls
run directly in the coordinator. Normal retries, crawl policies, page ceilings,
per-site job deduplication and sync alert follow-ups still apply.

An existing queued job is reused and brought forward like a manual request;
running actions and missing connections are skipped. A step waits through job
retries before the next step starts. A permanent failure does not stop the
other websites. Expired Google authorization skips further GSC work, and a
PageSpeed quota error skips further PageSpeed calls while retaining saved
reports. PageSpeed needs a key saved in **Settings > Connections** or
`GOOGLE_PAGESPEED_KEY` for larger portfolios; without one the quota is quickly
exhausted. Having a key does not make the quota unlimited.

## Progress, stopping and restarts

The `BulkJob` table stores selections, progress, results and the underlying job
IDs. Closing the dialog, navigating or reloading preserves progress.
**Stop queue** is checked every two seconds while waiting, including during a
crawl and the final step. It stops the batch without waiting for that action
to finish. Remaining steps are cancelled. An action already queued or running
continues separately, including retries; open the site to see its final result.
The batch marks that step as cancelled with an explanation, rather than
claiming the underlying job was stopped.

A web server restart interrupts coordination. After three minutes without a
heartbeat, the next status request marks unfinished batch steps as interrupted.
Already queued jobs remain in the normal queue and may finish in the worker.
The batch is not automatically replayed. Check each site's jobs and results
before starting a new batch to avoid repeating finished work.

## Database and ownership

Apply `20261008200000_add_bulk_jobs` before starting the app. The partial unique
index `BulkJob_one_active_per_user` permits one queued or running batch per
account, including simultaneous starts from different tabs. This index lives
only in the migration SQL; preserve it when generating later Prisma migrations.
All reads, selections and stops are scoped to the signed-in user, and each
step rechecks site ownership before it queues work.

## Verification

`npx vitest run app/api/user/bulk-jobs/route.test.ts lib/jobs/site-jobs.test.ts --pool=forks --maxWorkers=1`
runs the database-backed authorization, index, queue integration, retry,
cancellation and recovery checks with external providers mocked.

`npx playwright test --config=e2e/bulk.config.ts` exercises the actual dialog
in a browser with a local API fixture: site selection, limits, reload and
navigation persistence, stopping, error feedback and the mobile layout.
Install Chromium with `npx playwright install chromium` first, or set
`PLAYWRIGHT_CHANNEL` to an installed browser channel such as `msedge`.
The fixture server closes automatically when the tests finish.
