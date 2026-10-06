import type { PrismaClient } from "@prisma/client";
import type { RobotsReport } from "./robots";

type Db = Pick<PrismaClient, "auditPage" | "crawlIssue" | "$queryRaw">;

export interface CrawlPageStats {
  /** AuditPage rows of the crawl: one per crawled page. */
  pages: number;
  /** Average content score over all of them, or null without pages. */
  avgContentScore: number | null;
  /** Pages no other crawled page links to (the home page excluded). */
  orphans: number;
}

/**
 * Page counts of one crawl, counted in the database over every stored page,
 * so they never depend on how many rows a screen lists (#56).
 */
export async function getCrawlPageStats(db: Db, crawlId: string): Promise<CrawlPageStats> {
  const [agg, orphans] = await Promise.all([
    db.auditPage.aggregate({
      where: { crawlId },
      _count: { _all: true },
      _avg: { contentScore: true },
    }),
    countOrphans(db, crawlId),
  ]);
  const avg = agg._avg.contentScore;
  return {
    pages: agg._count._all,
    avgContentScore: avg == null ? null : Math.round(avg),
    orphans,
  };
}

/**
 * The crawler counts orphans from the inlinks of every page and stores the
 * total in the crawl summary row; it writes an orphan issue for the first 50
 * only. Read the total from the summary (without loading its page list), and
 * count the orphan issues for a crawl that has no summary.
 */
async function countOrphans(db: Db, crawlId: string): Promise<number> {
  const rows = await db.$queryRaw<{ orphans: number | null }[]>`
    SELECT ("details"->>'orphans')::int AS "orphans"
    FROM "CrawlIssue"
    WHERE "crawlId" = ${crawlId} AND "details"->>'kind' = 'crawl_summary'
    LIMIT 1`;
  const fromSummary = rows[0]?.orphans;
  if (fromSummary != null) return fromSummary;
  return db.crawlIssue.count({
    where: { crawlId, details: { path: ["kind"], equals: "orphan" } },
  });
}

/**
 * What robots.txt kept the crawler from fetching, from the crawl summary row
 * (without loading its page list). Null for crawls from before v0.2.2.
 */
export async function getCrawlRobotsReport(
  db: Pick<PrismaClient, "$queryRaw">,
  crawlId: string
): Promise<RobotsReport | null> {
  const rows = await db.$queryRaw<{ robots: RobotsReport | null }[]>`
    SELECT "details"->'robots' AS "robots"
    FROM "CrawlIssue"
    WHERE "crawlId" = ${crawlId} AND "details"->>'kind' = 'crawl_summary'
    LIMIT 1`;
  return rows[0]?.robots ?? null;
}

/** Columns the Crawled pages table shows. */
export const crawledPageColumns = {
  id: true,
  url: true,
  statusCode: true,
  contentScore: true,
  wordCount: true,
  h1Count: true,
  imageCount: true,
  imagesMissingAlt: true,
  internalLinks: true,
  responseTimeMs: true,
} as const;
