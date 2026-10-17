// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { db } = await import("@/lib/db");
    const { recoverCrawlsOnStartup } = await import("@/lib/crawler/lifecycle");
    const { startInlineJobLoop } = await import("@/lib/jobs/inline");
    // Crawls from before the job queue left RUNNING by the previous server
    // process (#57). Not awaited: a slow database must not hold up the server,
    // and the pages apply the same rule on every request anyway.
    void recoverCrawlsOnStartup(db);
    // WORKER_MODE=inline (the default) on a long-running server: this process
    // runs queued jobs itself. The loop recovers jobs of dead processes first.
    startInlineJobLoop(db);
  }
}
