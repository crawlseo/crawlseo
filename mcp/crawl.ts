import type { PrismaClient } from "@prisma/client";
import { recoverStaleCrawls, startSiteCrawl } from "../lib/crawler/lifecycle";

// The run_crawl and get_crawl_status tools. They follow the same rules as the
// web app (lib/crawler/lifecycle.ts): a crawl whose process died is marked
// FAILED, and only a crawl that is still alive blocks a new one (#57).

type Db = Pick<PrismaClient, "site" | "crawl">;

export async function runCrawl(
  db: Db,
  { siteId, maxPages }: { siteId: string; maxPages?: number }
): Promise<string> {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { id: true, domain: true },
  });
  if (!site) return `Site not found: ${siteId}`;

  const result = await startSiteCrawl(db, site, maxPages);
  if (!result.started) {
    return (
      `A crawl is already running for ${site.domain}.\n` +
      `Crawl ID: ${result.runningCrawlId}\n\n` +
      `Use get_crawl_status to check progress.`
    );
  }
  return (
    `Crawl started.\nCrawl ID: ${result.crawlId}\nStatus: RUNNING\n\n` +
    `Use get_crawl_status to check progress.`
  );
}

export async function crawlStatus(db: Db, crawlId: string): Promise<string> {
  await recoverStaleCrawls(db, { crawlId });

  const crawl = await db.crawl.findUnique({
    where: { id: crawlId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      pagesFound: true,
      issuesFound: true,
      healthScore: true,
      maxPages: true,
      error: true,
    },
  });
  if (!crawl) return `Crawl not found: ${crawlId}`;

  const lines = [
    `Crawl: ${crawl.id}`,
    `Status: ${crawl.status}`,
    ...(crawl.status === "FAILED" && crawl.error ? [`Error: ${crawl.error}`] : []),
    `Pages found: ${crawl.pagesFound} / ${crawl.maxPages} max`,
    `Issues found: ${crawl.issuesFound}`,
    `Health score: ${crawl.healthScore ?? "pending"}/100`,
    `Started: ${crawl.startedAt?.toISOString().slice(0, 16) ?? "-"}`,
    `Finished: ${crawl.finishedAt?.toISOString().slice(0, 16) ?? "-"}`,
  ];
  return lines.join("\n");
}
