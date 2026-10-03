import { db } from "@/lib/db";
import {
  fetchBingCrawlStats,
  fetchBingSearchStats,
  fetchBingTraffic,
  getBingApiKey,
} from "@/lib/bing";
// Bing days go through gscDate, the one day-to-UTC-midnight conversion, so a
// Bing row and a GSC row for the same day carry the same timestamp.
import { gscDate } from "@/lib/google";

export interface BingSyncResult {
  success: boolean;
  daysUpserted: number;
  queriesUpserted: number;
  pagesUpserted: number;
  error?: string;
  /** Endpoints that failed while the others were written. */
  partial?: string[];
}

/** Null keeps a counter Bing left out distinct from one it reported as zero. */
type DailyRow = {
  clicks?: number | null;
  impressions?: number | null;
  crawledPages?: number | null;
  inIndex?: number | null;
  inLinks?: number | null;
  code2xx?: number | null;
  code301?: number | null;
  code302?: number | null;
  code4xx?: number | null;
  code5xx?: number | null;
  blockedByRobots?: number | null;
  crawlErrors?: number | null;
};

/**
 * Pulls everything Bing has for one site and upserts it.
 *
 * No endpoint accepts a date range, so every sync is a full refresh: Bing
 * returns its whole history each time and the upserts make that idempotent.
 * That also means there is no backfill script to write, unlike GSC.
 */
export async function syncBingDataForSite(
  userId: string,
  siteId: string
): Promise<BingSyncResult> {
  const empty = { daysUpserted: 0, queriesUpserted: 0, pagesUpserted: 0 };

  try {
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, bingSite: true },
    });

    if (!site) throw new Error("Site not found");
    if (site.userId !== userId) {
      throw new Error("Unauthorized: Site does not belong to user");
    }
    if (!site.bingSite) {
      throw new Error("Site does not have a Bing Webmaster property connected");
    }

    // Resolved once: with no key every endpoint below would reject and the
    // caller would see "every Bing endpoint failed" instead of "add a key".
    const apiKey = await getBingApiKey(userId);

    // Four independent endpoints. Losing one should not throw away the three
    // that answered: there is no date parameter, so a retry re-downloads the
    // whole history again.
    const settled = await Promise.allSettled([
      fetchBingTraffic(apiKey, site.bingSite),
      fetchBingSearchStats(apiKey, site.bingSite, "query"),
      fetchBingSearchStats(apiKey, site.bingSite, "page"),
      fetchBingCrawlStats(apiKey, site.bingSite),
    ]);
    const [traffic, queries, pages, crawl] = settled.map((result) =>
      result.status === "fulfilled" ? result.value : []
    ) as [
      Awaited<ReturnType<typeof fetchBingTraffic>>,
      Awaited<ReturnType<typeof fetchBingSearchStats>>,
      Awaited<ReturnType<typeof fetchBingSearchStats>>,
      Awaited<ReturnType<typeof fetchBingCrawlStats>>,
    ];
    const failed = settled
      .map((result, index) =>
        result.status === "rejected"
          ? ["traffic", "queries", "pages", "crawl"][index]
          : null
      )
      .filter((name): name is string => name !== null);
    if (failed.length === settled.length) {
      throw new Error(`every Bing endpoint failed (${failed.join(", ")})`);
    }

    console.log(
      `[Bing Sync] ${site.bingSite}: ${traffic.length} traffic days, ` +
        `${queries.length} query weeks, ${pages.length} page weeks, ` +
        `${crawl.length} crawl days`
    );

    // Traffic and crawl stats are both keyed by (site, day), so they share a row.
    const daily = new Map<string, DailyRow>();
    for (const day of traffic) {
      daily.set(day.date, {
        ...daily.get(day.date),
        clicks: day.clicks,
        impressions: day.impressions,
      });
    }
    for (const day of crawl) {
      daily.set(day.date, {
        ...daily.get(day.date),
        crawledPages: day.crawledPages,
        inIndex: day.inIndex,
        inLinks: day.inLinks,
        code2xx: day.code2xx,
        code301: day.code301,
        code302: day.code302,
        code4xx: day.code4xx,
        code5xx: day.code5xx,
        blockedByRobots: day.blockedByRobots,
        crawlErrors: day.crawlErrors,
      });
    }

    // The rows are keyed by site, not property. A property change and a key
    // removal both wipe the site's rows in a transaction that also updates
    // the Site row, so the writes hold that row: whichever side commits
    // first, the other sees every row it must wipe or must not write.
    // Without the lock a change landing between a check and the last upsert
    // leaves the old property's rows under the new one. NO KEY: the lock
    // still serialises with the PUT and other syncs, but not with the
    // foreign-key checks on Keyword/Page inserts, which would wait out the
    // whole transaction under a plain FOR UPDATE.
    const written = await db.$transaction(
      async (tx) => {
        const [locked] = await tx.$queryRaw<{ bingSite: string | null }[]>`
          SELECT "bingSite" FROM "Site" WHERE "id" = ${siteId} FOR NO KEY UPDATE
        `;
        if (locked?.bingSite !== site.bingSite) {
          throw new Error("Bing property changed during the sync; nothing written");
        }

        let daysUpserted = 0;
        for (const [date, values] of daily) {
          await tx.bingDaily.upsert({
            where: { siteId_date: { siteId, date: gscDate(date) } },
            create: { siteId, date: gscDate(date), ...values },
            update: values,
          });
          daysUpserted++;
        }

        const counts = { query: 0, page: 0 };
        for (const kind of ["query", "page"] as const) {
          for (const row of kind === "query" ? queries : pages) {
            const values = {
              clicks: row.clicks,
              impressions: row.impressions,
              avgImpressionPosition: row.avgImpressionPosition,
            };
            await tx.bingSearchWeekly.upsert({
              where: {
                siteId_kind_key_weekEnding: {
                  siteId,
                  kind,
                  key: row.key,
                  weekEnding: gscDate(row.weekEnding),
                },
              },
              create: {
                siteId,
                kind,
                key: row.key,
                weekEnding: gscDate(row.weekEnding),
                ...values,
              },
              update: values,
            });
            counts[kind]++;
          }
        }
        return { daysUpserted, ...counts };
      },
      // Every row goes through one connection while the lock is held. The
      // budget leaves room for the 20 s fetch deadline inside the route's 60 s
      // on Vercel, and a timeout rolls everything back, so the caller gets an
      // error rather than a platform kill with nothing persisted.
      { timeout: 35_000 }
    );

    return {
      success: true,
      daysUpserted: written.daysUpserted,
      queriesUpserted: written.query,
      pagesUpserted: written.page,
      ...(failed.length > 0 && { partial: failed }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Bing Sync] Error syncing site ${siteId}:`, message);
    return { success: false, ...empty, error: message };
  }
}
