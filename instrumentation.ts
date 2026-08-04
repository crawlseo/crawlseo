// Next.js instrumentation hook - register() runs once when the server
// process boots. Used here to schedule the daily GSC sync: there's no
// external job runner in this deployment (single Docker container, no
// Vercel Cron / host crontab wired up), so the simplest correct thing is an
// in-process interval that lives for the lifetime of the server. Fine as
// long as there's exactly one app instance - true for this docker-compose
// setup (one `app` replica). If that ever changes, this needs to move to a
// real external scheduler to avoid every instance syncing independently.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const { syncAllSites } = await import("@/lib/workers/gsc-sync");

  async function runDailySync() {
    console.log("[GSC daily sync] starting");
    try {
      const results = await syncAllSites();
      console.log(
        `[GSC daily sync] done - ${results.length} site(s): ` +
          results
            .map((r) => `${r.domain} (${r.result.success ? "ok" : "failed"})`)
            .join(", ")
      );
    } catch (err) {
      console.error("[GSC daily sync] failed:", err);
    }
  }

  // Run shortly after boot (catches up anything missed while the container
  // was down) and then every 24h. Delayed, not immediate, so it doesn't
  // compete with the app's own startup for DB connections.
  setTimeout(runDailySync, 30_000);
  setInterval(runDailySync, ONE_DAY_MS);
}
