import type { PrismaClient } from "@prisma/client";
import { createAccessKey } from "@/lib/access-keys";

/*
 * Two users with a site each, for the /api/v1 and MCP tests: Search Console
 * rows over the last days, a completed and a stale running crawl with
 * issues, and vitals. Only user A's data should ever reach user A's key.
 * Both have MCP turned on; a third user with a key has not.
 */

export const DAY_MS = 86_400_000;

export function daysAgo(n: number): Date {
  const d = new Date(Date.now() - n * DAY_MS);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export type Fixtures = { keyA: string; keyB: string; keyAId: string; keyOff: string };

export async function seedApiFixtures(db: PrismaClient): Promise<Fixtures> {
  await db.user.create({ data: { id: "user-a", email: "a@quilltab.app" } });
  await db.user.create({ data: { id: "user-b", email: "b@quilltab.app" } });
  await db.user.create({ data: { id: "user-off", email: "off@quilltab.app" } });
  await db.userSettings.createMany({ data: [{ userId: "user-a", mcpEnabled: true }, { userId: "user-b", mcpEnabled: true }] });
  await db.site.create({ data: { id: "site-a", userId: "user-a", domain: "quilltab.app", gscProperty: "sc-domain:quilltab.app" } });
  await db.site.create({ data: { id: "site-b", userId: "user-b", domain: "secret-b.com", gscProperty: "sc-domain:secret-b.com" } });

  for (const [siteId, query, url] of [
    ["site-a", "quilltab notes", "https://quilltab.app/"],
    ["site-b", "secret b query", "https://secret-b.com/private"],
  ]) {
    for (let i = 1; i <= 40; i++) {
      await db.keyword.create({ data: { siteId, query, date: daysAgo(i), clicks: 10, impressions: 100, ctr: 0.1, position: 4 } });
      await db.page.create({ data: { siteId, url, date: daysAgo(i), clicks: 10, impressions: 100, ctr: 0.1, position: 4 } });
    }
  }
  // An older query, only inside a date range that goes back far enough.
  await db.keyword.create({ data: { siteId: "site-a", query: "old query", date: daysAgo(100), clicks: 7, impressions: 70, ctr: 0.1, position: 12 } });

  await db.crawl.create({
    data: { id: "crawl-a1", siteId: "site-a", status: "COMPLETED", startedAt: daysAgo(3), finishedAt: daysAgo(3), pagesFound: 12, issuesFound: 2, healthScore: 88 },
  });
  // RUNNING with no job and no progress for hours: its process is gone.
  await db.crawl.create({
    data: { id: "crawl-a2", siteId: "site-a", status: "RUNNING", startedAt: daysAgo(1), lastProgressAt: daysAgo(1) },
  });
  await db.crawl.create({
    data: { id: "crawl-b1", siteId: "site-b", status: "COMPLETED", startedAt: daysAgo(2), finishedAt: daysAgo(2), pagesFound: 5, issuesFound: 1, healthScore: 50 },
  });
  await db.crawlIssue.createMany({
    data: [
      { crawlId: "crawl-a1", url: "https://quilltab.app/broken", type: "BROKEN_LINK", severity: "CRITICAL", message: "Broken link (404)" },
      { crawlId: "crawl-a1", url: "https://quilltab.app/", type: "MISSING_DESCRIPTION", severity: "WARNING", message: "No meta description" },
      { crawlId: "crawl-a1", url: "https://quilltab.app/", type: "MISSING_SCHEMA", severity: "INFO", message: "summary", details: { kind: "crawl_summary" } },
      { crawlId: "crawl-b1", url: "https://secret-b.com/private", type: "BROKEN_LINK", severity: "CRITICAL", message: "secret b issue" },
    ],
  });
  await db.vitalsReport.createMany({
    data: [
      { siteId: "site-a", url: "https://quilltab.app/", date: daysAgo(1), device: "MOBILE", lcp: 2.1, cls: 0.05, inp: 180, ttfb: 0.4, perfScore: 91 },
      { siteId: "site-a", url: "https://quilltab.app/", date: daysAgo(1), device: "DESKTOP", lcp: 1.2, cls: 0.01, inp: 90, ttfb: 0.2, perfScore: 98 },
      { siteId: "site-b", url: "https://secret-b.com/", date: daysAgo(1), device: "MOBILE", lcp: 9.9, perfScore: 10 },
    ],
  });

  const a = await createAccessKey(db, "user-a", "laptop");
  const b = await createAccessKey(db, "user-b", "laptop");
  const off = await createAccessKey(db, "user-off", "laptop");
  return { keyA: a.key, keyB: b.key, keyAId: a.id, keyOff: off.key };
}

/** Every row of every table the API reads, to prove a request changed nothing. */
export async function snapshotUserData(db: PrismaClient): Promise<string> {
  const tables = await Promise.all([
    db.user.findMany({ orderBy: { id: "asc" } }),
    db.site.findMany({ orderBy: { id: "asc" } }),
    db.keyword.findMany({ orderBy: { id: "asc" } }),
    db.page.findMany({ orderBy: { id: "asc" } }),
    db.crawl.findMany({ orderBy: { id: "asc" } }),
    db.crawlIssue.findMany({ orderBy: { id: "asc" } }),
    db.vitalsReport.findMany({ orderBy: { id: "asc" } }),
    db.job.findMany({ orderBy: { id: "asc" } }),
    db.alert.findMany({ orderBy: { id: "asc" } }),
    db.userSettings.findMany({ orderBy: { userId: "asc" } }),
    db.accessKey.findMany({ orderBy: { id: "asc" }, select: { id: true, userId: true, name: true, keyHash: true, prefix: true } }),
  ]);
  return JSON.stringify(tables);
}
