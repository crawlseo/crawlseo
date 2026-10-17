import type { Job, PrismaClient } from "@prisma/client";
import { recoverStaleCrawls } from "@/lib/crawler/lifecycle";
import { isServerless } from "./config";
import { CRAWL_JOB } from "./handlers";
import { canStartCrawl, clampMaxPages, type CrawlRequestSource } from "./policy";
import { enqueueJob, MANUAL_PRIORITY, recoverStaleJobs } from "./queue";
import type { JobSource } from "./types";

/*
 * What the routes and the MCP server call: queue work for a site, and read
 * the state of that work for the UI.
 */

type Db = PrismaClient;

export type CrawlRequest =
  | { status: "queued"; job: Job; maxPages: number }
  | { status: "active"; job: Job }
  | { status: "refused"; reason: string; httpStatus: number };

/**
 * The one way to ask for a crawl (crawl route, MCP, scheduler): clamp the page
 * count, ask the policy, then queue a crawl job. A crawl job already queued or
 * running for the site is returned instead (`active`). A job whose process
 * died does not count: it is recovered first (#57).
 */
export async function requestCrawl(
  db: Db,
  site: { id: string; userId: string },
  opts: { maxPages?: unknown; source: CrawlRequestSource }
): Promise<CrawlRequest> {
  const maxPages = clampMaxPages(opts.maxPages);
  const permission = await canStartCrawl(site, { source: opts.source, maxPages });
  if (!permission.ok) return { status: "refused", reason: permission.reason, httpStatus: permission.status };

  await recoverStaleJobs(db, { siteId: site.id });
  const { job, created } = await enqueueJob(db, {
    type: CRAWL_JOB,
    siteId: site.id,
    source: opts.source,
    payload: { maxPages },
    priority: opts.source === "schedule" ? 0 : MANUAL_PRIORITY,
  });
  return created ? { status: "queued", job, maxPages } : { status: "active", job };
}

/** Queues a job of another type for a site, or returns the active one. */
export async function requestSiteJob(
  db: Db,
  opts: { type: string; siteId: string; source: JobSource }
): Promise<{ job: Job; created: boolean }> {
  await recoverStaleJobs(db, { siteId: opts.siteId });
  return enqueueJob(db, {
    type: opts.type,
    siteId: opts.siteId,
    source: opts.source,
    priority: opts.source === "schedule" || opts.source === "chain" ? 0 : MANUAL_PRIORITY,
  });
}

/**
 * What the crawl screens show besides the latest completed crawl: a crawl job
 * queued or running, or the failure of the last attempt since that crawl.
 */
export async function getCrawlActivity(db: Db, siteId: string, lastCompletedAt: Date | null) {
  await recoverStaleJobs(db, { siteId });
  await recoverStaleCrawls(db, { siteId });

  const job = await db.job.findFirst({
    where: { siteId, type: CRAWL_JOB, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true, status: true, crawlId: true },
  });
  const active = job
    ? { jobId: job.id, status: job.status as "QUEUED" | "RUNNING", crawlId: job.crawlId }
    : null;
  const failed = active
    ? null
    : await db.crawl.findFirst({
        where: {
          siteId,
          status: "FAILED",
          ...(lastCompletedAt && { finishedAt: { gt: lastCompletedAt } }),
        },
        orderBy: { finishedAt: { sort: "desc", nulls: "last" } },
        select: { id: true, error: true, finishedAt: true },
      });

  return { active, failed };
}

/** A queued job that waits this long with no process seen picking jobs up counts as stalled. */
export const STALLED_AFTER_MS = 2 * 60_000;

/** Whether any process that runs jobs sent a heartbeat recently. */
export async function workerSeen(db: Db, now: Date = new Date()): Promise<boolean> {
  const n = await db.workerHeartbeat.count({
    where: { lastSeenAt: { gte: new Date(now.getTime() - STALLED_AFTER_MS) } },
  });
  return n > 0;
}

/** A job as the UI polls it (GET /api/jobs/[jobId]). */
export type JobView = {
  id: string;
  type: string;
  status: Job["status"];
  attempts: number;
  maxAttempts: number;
  runAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  errorCode: string | null;
  result: unknown;
  crawl: {
    id: string;
    status: string;
    pagesFound: number;
    issuesFound: number;
    healthScore: number | null;
    error: string | null;
    finishedAt: string | null;
  } | null;
  /** Queued for a while and no process is picking jobs up: the worker is probably not running. */
  stalled: boolean;
};

/** The job as the UI sees it, and its site (for the ownership check). */
export async function jobView(
  db: Db,
  jobId: string,
  now: Date = new Date()
): Promise<{ siteId: string; view: JobView } | null> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: {
      crawl: {
        select: {
          id: true,
          status: true,
          pagesFound: true,
          issuesFound: true,
          healthScore: true,
          error: true,
          finishedAt: true,
        },
      },
    },
  });
  if (!job) return null;

  const waiting = job.status === "QUEUED" && job.runAt.getTime() < now.getTime() - STALLED_AFTER_MS;
  // On a serverless host no process polls; queued jobs wait for a request or the cron.
  const stalled = waiting && !isServerless() && !(await workerSeen(db, now));

  const view: JobView = {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    lastError: job.lastError,
    errorCode: job.errorCode,
    result: job.result,
    crawl: job.crawl && {
      ...job.crawl,
      finishedAt: job.crawl.finishedAt?.toISOString() ?? null,
    },
    stalled,
  };
  return { siteId: job.siteId, view };
}
