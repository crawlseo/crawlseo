import { Prisma, type IssueSeverity, type PrismaClient } from "@prisma/client";

/**
 * Rows the crawler writes for its own bookkeeping, marked by details.kind:
 * one crawl summary per crawl and one content score per thin page. They are
 * not issues a user should see or count.
 */
export const INTERNAL_ISSUE_KINDS = ["crawl_summary", "content_score"] as const;

/**
 * Filter for the issues a user sees: every CrawlIssue except the internal kinds.
 *
 * Most issues have no details.kind at all. In SQL a comparison with a missing
 * JSON key is NULL, and NOT NULL is still NULL, so `NOT (kind = 'crawl_summary')`
 * on its own drops every one of them (#55). The first branch keeps them
 * explicitly: Prisma's AnyNull on a JSON path compiles to
 * `details #> '{kind}' IS NULL OR = 'null'`, which matches a NULL details, a
 * details without the key and `kind: null`. The second branch only sees rows
 * with a real kind, where the negated comparisons are never NULL.
 */
export function visibleIssueFilter(): Prisma.CrawlIssueWhereInput {
  return {
    OR: [
      { details: { path: ["kind"], equals: Prisma.AnyNull } },
      {
        AND: INTERNAL_ISSUE_KINDS.map((kind) => ({
          NOT: { details: { path: ["kind"], equals: kind } },
        })),
      },
    ],
  };
}

/** The visible issues of one crawl. */
export function visibleIssuesWhere(crawlId: string): Prisma.CrawlIssueWhereInput {
  return { crawlId, ...visibleIssueFilter() };
}

type Db = Pick<PrismaClient, "crawlIssue">;

/** How many issues of a crawl a user sees. */
export function countVisibleIssues(db: Db, crawlId: string): Promise<number> {
  return db.crawlIssue.count({ where: visibleIssuesWhere(crawlId) });
}

export type SeverityCounts = Record<IssueSeverity, number>;

/**
 * The issues of a crawl for the Crawl / Audit page: up to `take` rows, plus
 * the total and the per-severity counts over all of them, so the counts never
 * depend on how many rows the page lists.
 */
export async function getVisibleIssues(db: Db, crawlId: string, take = 200) {
  const where = visibleIssuesWhere(crawlId);
  const [issues, groups] = await Promise.all([
    db.crawlIssue.findMany({
      where,
      orderBy: [{ severity: "asc" }, { type: "asc" }, { url: "asc" }],
      take,
    }),
    db.crawlIssue.groupBy({ by: ["severity"], where, _count: { _all: true } }),
  ]);
  const bySeverity: SeverityCounts = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const g of groups) bySeverity[g.severity] = g._count._all;
  const total = bySeverity.CRITICAL + bySeverity.WARNING + bySeverity.INFO;
  return { issues, total, bySeverity };
}

/** Issues for the MCP get_crawl_issues tool: visible issues only, optionally one severity. */
export function listVisibleIssues(
  db: Db,
  { crawlId, severity, limit }: { crawlId: string; severity?: IssueSeverity; limit: number }
) {
  return db.crawlIssue.findMany({
    where: { ...visibleIssuesWhere(crawlId), ...(severity ? { severity } : {}) },
    take: limit,
    orderBy: [{ severity: "asc" }, { type: "asc" }],
    select: { severity: true, type: true, url: true, message: true },
  });
}
