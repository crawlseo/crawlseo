import type { PrismaClient } from "@prisma/client";
import { recoverStaleCrawls } from "../lib/crawler/lifecycle";
import { CRAWL_JOB } from "../lib/jobs/handlers";
import { recoverStaleJobs } from "../lib/jobs/queue";
import { requestCrawl } from "../lib/jobs/site-jobs";
import { runHereIfNoWorker } from "../lib/jobs/standalone";

// The run_crawl and get_crawl_status tools. run_crawl queues a crawl job with
// the same rules as the web app (lib/jobs/site-jobs.ts requestCrawl). The app
// (WORKER_MODE=inline) or the worker runs it; when neither is seen, this MCP
// process runs it itself (runHereIfNoWorker).

type Db = PrismaClient;

export async function runCrawl(
  db: Db,
  { siteId, maxPages }: { siteId: string; maxPages?: number }
): Promise<string> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, domain: true, userId: true },
  });
  if (!site) return `Site not found: ${siteId}`;

  const result = await requestCrawl(db, site, { maxPages, source: "mcp" });
  if (result.status === "refused") return `Crawl not started: ${result.reason}`;
  if (result.status === "active" && result.job.status === "RUNNING") {
    return (
      `A crawl is already running for ${site.domain}.\n` +
      `Job ID: ${result.job.id}\n\n` +
      `Use get_crawl_status with the job ID to check progress.`
    );
  }

  const here = await runHereIfNoWorker(db, result.job, { log: (m) => console.error(m) });
  const pages = (result.job.payload as { maxPages?: number } | null)?.maxPages;
  const head =
    result.status === "active"
      ? `A crawl was already queued for ${site.domain}; it now runs next with this page limit.`
      : "Crawl queued.";
  return (
    `${head}\nJob ID: ${result.job.id}\nPage limit: ${pages}\n\n` +
    (here
      ? "No crawlseo app or worker is running jobs, so this MCP server runs the crawl itself. Keep it running until the crawl is done. "
      : "It runs when the crawlseo app or its worker picks it up. ") +
    `Use get_crawl_status with the job ID to check progress.`
  );
}

function crawlLines(crawl: {
  id: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  pagesFound: number;
  issuesFound: number;
  healthScore: number | null;
  maxPages: number;
  error: string | null;
}): string[] {
  return [
    `Crawl: ${crawl.id}`,
    `Status: ${crawl.status}`,
    ...(crawl.status === "FAILED" && crawl.error ? [`Error: ${crawl.error}`] : []),
    `Pages found: ${crawl.pagesFound} / ${crawl.maxPages} max`,
    `Issues found: ${crawl.issuesFound}`,
    `Health score: ${crawl.healthScore ?? "pending"}/100`,
    `Started: ${crawl.startedAt?.toISOString().slice(0, 16) ?? "-"}`,
    `Finished: ${crawl.finishedAt?.toISOString().slice(0, 16) ?? "-"}`,
  ];
}

const CRAWL_FIELDS = {
  id: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  pagesFound: true,
  issuesFound: true,
  healthScore: true,
  maxPages: true,
  error: true,
} as const;

/** Status of a crawl job (the id run_crawl returns) or of a crawl. */
export async function crawlStatus(db: Db, id: string): Promise<string> {
  const job = await db.job.findUnique({ where: { id } });
  if (job && job.type === CRAWL_JOB) {
    await recoverStaleJobs(db, { siteId: job.siteId });
    const fresh = await db.job.findUniqueOrThrow({
      where: { id },
      include: { crawl: { select: CRAWL_FIELDS } },
    });
    const lines = [
      `Job: ${fresh.id}`,
      `Job status: ${fresh.status}`,
      `Attempts: ${fresh.attempts} / ${fresh.maxAttempts}`,
      ...(fresh.lastError ? [`Last error: ${fresh.lastError}`] : []),
    ];
    if (fresh.status === "QUEUED") {
      lines.push(`Queued: waiting for the crawlseo app or its worker (not before ${fresh.runAt.toISOString().slice(0, 16)})`);
    }
    if (fresh.crawl) lines.push("", ...crawlLines(fresh.crawl));
    return lines.join("\n");
  }

  await recoverStaleCrawls(db, { crawlId: id });
  const crawl = await db.crawl.findUnique({ where: { id }, select: CRAWL_FIELDS });
  if (!crawl) return `Crawl or job not found: ${id}`;
  return crawlLines(crawl).join("\n");
}
