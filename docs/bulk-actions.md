# Portfolio actions

The dashboard and Websites page have a **Bulk actions** button beside **Add site**.
Choose all websites or a subset and select GSC, Bing, Crawl / Audit and PageSpeed.
GSC is selected by default. Crawl limits range from 25 to 2,000 pages per website;
PageSpeed checks 1, 3 or 5 top pages on mobile, with the homepage as a fallback.

Steps run sequentially in the self-hosted Next.js server after the request has
returned. A crawl must finish before the next website starts. Existing crawls
and missing connections are skipped. One website's failure does not stop the
rest; expired Google authorization skips further GSC work, and a PageSpeed quota
error skips further PageSpeed calls, preserving any reports already saved.

The `BulkJob` table stores the selection, progress and latest results. A partial
unique index permits one queued or running batch per account, including requests
from different tabs. All reads, selections and cancellation requests are scoped
to the signed-in user, and each step rechecks ownership before starting work.

You can close the dialog, navigate or reload and return to the same progress.
**Stop queue** lets the current step finish and cancels pending steps. A server
restart interrupts the worker: after three minutes without a heartbeat, the next
status request marks unfinished steps as interrupted. Work is not automatically
replayed; review the results and start a new selection to retry. This is an
in-process worker for self-hosting, not a durable external queue for serverless
execution. Apply the included database migration before starting the new app.
