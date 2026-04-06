import { db } from "@/lib/db";
import { fetchSearchAnalytics, fetchPageAnalytics } from "@/lib/google";
import { getDateRange } from "@/lib/date-utils";

interface SyncResult {
  success: boolean;
  keywordsInserted: number;
  pagesInserted: number;
  startDate: string;
  endDate: string;
  error?: string;
}

/**
 * Syncs GSC data for a specific site
 * Fetches last 28 days of keywords and pages data
 */
export async function syncGSCDataForSite(
  userId: string,
  siteId: string,
  daysBack: number = 28
): Promise<SyncResult> {
  try {
    // Verify site belongs to user
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, gscProperty: true },
    });

    if (!site) {
      throw new Error("Site not found");
    }

    if (site.userId !== userId) {
      throw new Error("Unauthorized: Site does not belong to user");
    }

    if (!site.gscProperty) {
      throw new Error("Site does not have GSC property connected");
    }

    // Get date range
    const { start, end } = getDateRange(daysBack);

    console.log(`[GSC Sync] Starting sync for site ${siteId}`);
    console.log(`[GSC Sync] Date range: ${start} to ${end}`);

    // Fetch keywords and pages in parallel
    const [keywords, pages] = await Promise.all([
      fetchSearchAnalytics(
        userId,
        site.gscProperty,
        start,
        end,
        ["query", "page", "date", "device", "country"]
      ),
      fetchPageAnalytics(userId, site.gscProperty, start, end),
    ]);

    console.log(
      `[GSC Sync] Fetched ${keywords.length} keyword records and ${pages.length} page records`
    );

    // Insert/update keywords with upsert
    let keywordsInserted = 0;
    for (const keyword of keywords) {
      try {
        const date = new Date(keyword.date);
        date.setHours(0, 0, 0, 0); // Normalize to start of day

        await db.keyword.upsert({
          where: {
            siteId_query_date: {
              siteId,
              query: keyword.query,
              date,
            },
          },
          create: {
            siteId,
            query: keyword.query,
            date,
            clicks: keyword.clicks,
            impressions: keyword.impressions,
            ctr: keyword.ctr,
            position: keyword.position,
            page: keyword.page,
            device: keyword.device,
            country: keyword.country,
          },
          update: {
            clicks: keyword.clicks,
            impressions: keyword.impressions,
            ctr: keyword.ctr,
            position: keyword.position,
          },
        });

        keywordsInserted++;
      } catch (error) {
        console.warn(`[GSC Sync] Failed to upsert keyword: ${keyword.query}`, error);
      }
    }

    // Insert/update pages
    let pagesInserted = 0;
    for (const page of pages) {
      if (!page.page) continue;

      try {
        const date = new Date(page.date);
        date.setHours(0, 0, 0, 0); // Normalize to start of day

        await db.page.upsert({
          where: {
            siteId_url_date: {
              siteId,
              url: page.page,
              date,
            },
          },
          create: {
            siteId,
            url: page.page,
            date,
            clicks: page.clicks,
            impressions: page.impressions,
            ctr: page.ctr,
            position: page.position,
          },
          update: {
            clicks: page.clicks,
            impressions: page.impressions,
            ctr: page.ctr,
            position: page.position,
          },
        });

        pagesInserted++;
      } catch (error) {
        console.warn(`[GSC Sync] Failed to upsert page: ${page.page}`, error);
      }
    }

    console.log(
      `[GSC Sync] Sync completed: ${keywordsInserted} keywords, ${pagesInserted} pages`
    );

    return {
      success: true,
      keywordsInserted,
      pagesInserted,
      startDate: start,
      endDate: end,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GSC Sync] Error syncing site ${siteId}:`, errorMessage);

    return {
      success: false,
      keywordsInserted: 0,
      pagesInserted: 0,
      startDate: "",
      endDate: "",
      error: errorMessage,
    };
  }
}

/**
 * Syncs GSC data for all sites of a user
 */
export async function syncAllUserSites(userId: string): Promise<
  Array<{
    siteId: string;
    domain: string;
    result: SyncResult;
  }>
> {
  const sites = await db.site.findMany({
    where: { userId },
    select: { id: true, domain: true },
  });

  const results = [];

  for (const site of sites) {
    const result = await syncGSCDataForSite(userId, site.id);
    results.push({
      siteId: site.id,
      domain: site.domain,
      result,
    });
  }

  return results;
}
