import type { PrismaClient } from "@prisma/client";

/*
 * A crawl whose fetched pages are all, or nearly all, noindex. Such a crawl
 * has no issues and a score of 100, because noindex pages are not scored
 * (#105), yet search engines drop every one of those pages. The crawl page,
 * the site overview, /api/v1 and the NOINDEX_SITEWIDE alert say so.
 */

/** Share of the fetched (2xx) pages that must be noindex for the warning. */
export const NOINDEX_WARNING_SHARE = 0.8;

export type NoindexWarning = {
  /** noindex pages among the fetched (2xx) pages. */
  noindexPages: number;
  /** Pages fetched with a 2xx status. */
  fetchedPages: number;
  message: string;
};

/** The warning for these counts, or null below NOINDEX_WARNING_SHARE or without fetched pages. */
export function noindexWarning(noindexPages: number, fetchedPages: number): NoindexWarning | null {
  if (fetchedPages <= 0 || noindexPages < fetchedPages * NOINDEX_WARNING_SHARE) return null;
  return {
    noindexPages,
    fetchedPages,
    message: `${noindexPages} of ${fetchedPages} pages are noindex. If that is not intended, search engines will drop them.`,
  };
}

const FETCHED = { statusCode: { gte: 200, lt: 300 } };

/** The warning for one crawl, counted over its stored pages. */
export async function getNoindexWarning(
  db: Pick<PrismaClient, "auditPage">,
  crawlId: string
): Promise<NoindexWarning | null> {
  const [fetched, noindex] = await Promise.all([
    db.auditPage.count({ where: { crawlId, ...FETCHED } }),
    db.auditPage.count({ where: { crawlId, indexable: false, ...FETCHED } }),
  ]);
  return noindexWarning(noindex, fetched);
}
