import type { Prisma, PrismaClient } from "@prisma/client";
import type { RobotsReport } from "./robots";

type Db = Pick<PrismaClient, "auditPage" | "crawlIssue" | "$queryRaw">;

export interface CrawlPageStats {
  /** AuditPage rows of the crawl: one per crawled page. */
  pages: number;
  /** Average content score over the audited pages, or null without any. */
  avgContentScore: number | null;
  /** Pages no other crawled page links to (the home page excluded). */
  orphans: number;
  /** Pages crawled but kept out of the score and the issues because they are noindex (#105). */
  noindex: number;
}

/**
 * The pages a crawl keeps out of its audit: noindex pages that are not
 * broken (a broken page is reported whatever it says). Mirrors isAudited in
 * engine.ts.
 */
export const NOINDEX_PAGE = { indexable: false, statusCode: { lt: 400 } } satisfies Prisma.AuditPageWhereInput;

/**
 * Page counts of one crawl, counted in the database over every stored page,
 * so they never depend on how many rows a screen lists (#56).
 */
export async function getCrawlPageStats(db: Db, crawlId: string): Promise<CrawlPageStats> {
  const [pages, avgAgg, orphans, noindex] = await Promise.all([
    db.auditPage.count({ where: { crawlId } }),
    db.auditPage.aggregate({
      where: { crawlId, NOT: NOINDEX_PAGE },
      _avg: { contentScore: true },
    }),
    countOrphans(db, crawlId),
    db.auditPage.count({ where: { crawlId, ...NOINDEX_PAGE } }),
  ]);
  const avg = avgAgg._avg.contentScore;
  return {
    pages,
    avgContentScore: avg == null ? null : Math.round(avg),
    orphans,
    noindex,
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
  indexable: true,
  noindexSource: true,
} as const;
