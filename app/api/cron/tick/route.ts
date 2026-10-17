import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { jobTypes } from "@/lib/jobs/handlers";
import { claimJobs, recoverStaleJobs } from "@/lib/jobs/queue";
import { JobRunner } from "@/lib/jobs/runner";
import { runScheduler } from "@/lib/jobs/scheduler";

/*
 * The scheduler on a host without a long-running process (Vercel Cron, see
 * vercel.json): queues the due SHORT jobs (GSC and Bing syncs, alert
 * evaluation) and runs SHORT jobs until the time budget is spent. Crawls and
 * vitals checks are never scheduled here; they need the worker.
 *
 * Vercel sends CRON_SECRET as "Authorization: Bearer <secret>" (README,
 * Vercel section, links its docs). Without CRON_SECRET every request is
 * refused. Safe to call twice: a recent pass is skipped and
 * every job is claimed by one caller only.
 */

// The most every Vercel plan allows (README, Vercel section).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** No new job starts after this; the one running gets until the deadline. */
const CLAIM_UNTIL_MS = 180_000;
const DEADLINE_MS = 270_000;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const started = Date.now();
    const short = jobTypes("SHORT");

    const recovered = await recoverStaleJobs(db);
    const schedule = await runScheduler(db, { types: short });

    const runner = new JobRunner(db);
    let processed = 0;
    while (Date.now() - started < CLAIM_UNTIL_MS) {
      const [job] = await claimJobs(db, { workerId: runner.workerId, types: short, limit: 1 });
      if (!job) break;
      await runner.execute(job, { deadline: started + DEADLINE_MS });
      processed++;
    }

    const remaining = await db.job.count({
      where: { status: "QUEUED", type: { in: short }, runAt: { lte: new Date() } },
    });
    return Response.json({ recovered, scheduled: schedule, processed, remaining });
  } catch (error) {
    console.error("Cron tick failed:", error);
    return Response.json({ error: "Cron tick failed" }, { status: 500 });
  }
}
