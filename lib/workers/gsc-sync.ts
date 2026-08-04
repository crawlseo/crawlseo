import { db } from "@/lib/db";
import { fetchSearchAnalytics, fetchPageAnalytics, ReauthRequiredError } from "@/lib/google";
import { getDateRange } from "@/lib/date-utils";

interface SyncResult {
  success: boolean;
  keywordsInserted: number;
  pagesInserted: number;
  startDate: string;
  endDate: string;
  error?: string;
}

// A 180-day sync can return 100k+ rows; upserting one at a time (one
// sequential Postgres round-trip per row) made that take tens of minutes.
// Bounded concurrency gets the same upsert semantics - same per-row
// try/catch, one failure doesn't abort the batch - at a fraction of the
// wall-clock time.
export async function upsertBatch<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  onError: (item: T, err: unknown) => void,
  concurrency = 50
): Promise<number> {
  let succeeded = 0;
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map(fn));
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") succeeded++;
      else onError(chunk[idx], r.reason);
    });
  }
  return succeeded;
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
    const keywordsInserted = await upsertBatch(
      keywords,
      async (keyword) => {
        // keyword.date is a bare "YYYY-MM-DD" string from Google's API -
        // new Date() already parses that as exact UTC midnight per spec, no
        // normalization needed. setHours() operates in *local* time, so on
        // any host not running in UTC it silently shifts the stored date by
        // the local UTC offset, corrupting which calendar day the row lands
        // on. (Confirmed in practice: rows synced from a UTC+2 dev machine
        // landed at 22:00 UTC the previous day, double-counting into the
        // wrong day's totals once aggregated.)
        const date = new Date(keyword.date);

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
            page: keyword.page,
            device: keyword.device,
            country: keyword.country,
          },
        });
      },
      (keyword, error) =>
        console.warn(`[GSC Sync] Failed to upsert keyword: ${keyword.query}`, error)
    );

    // Insert/update pages
    const pagesInserted = await upsertBatch(
      pages.filter((p): p is typeof pages[number] & { page: string } => Boolean(p.page)),
      async (page) => {
        // See the keyword upsert above - no normalization needed or wanted.
        const date = new Date(page.date);

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
      },
      (page, error) =>
        console.warn(`[GSC Sync] Failed to upsert page: ${page.page}`, error)
    );

    console.log(
      `[GSC Sync] Sync completed: ${keywordsInserted} keywords, ${pagesInserted} pages`
    );

    await db.site.update({
      where: { id: siteId },
      data: { gscLastSyncedAt: new Date() },
    });

    return {
      success: true,
      keywordsInserted,
      pagesInserted,
      startDate: start,
      endDate: end,
    };
  } catch (error) {
    // Re-throw as-is: the caller (e.g. the manual sync route) needs to
    // distinguish this from a generic failure to prompt reconnecting Google,
    // not just show "sync failed".
    if (error instanceof ReauthRequiredError) throw error;

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
    results.push({
      siteId: site.id,
      domain: site.domain,
      result: await syncOneSiteIsolated(userId, site.id),
    });
  }

  return results;
}

/**
 * Syncs GSC data for every site, across every user, that has a GSC property
 * connected. Used by the daily recurring sync (see instrumentation.ts) - a
 * small trailing window is enough here since only the most recent few days
 * of GSC data are ever revised; the 180-day depth is handled once, up
 * front, by the initial per-site sync instead of being re-fetched daily.
 */
export async function syncAllSites(daysBack: number = 7): Promise<
  Array<{
    siteId: string;
    domain: string;
    result: SyncResult;
  }>
> {
  const sites = await db.site.findMany({
    where: { gscProperty: { not: null } },
    select: { id: true, userId: true, domain: true },
  });

  const results = [];

  for (const site of sites) {
    results.push({
      siteId: site.id,
      domain: site.domain,
      result: await syncOneSiteIsolated(site.userId, site.id, daysBack),
    });
  }

  return results;
}

// syncGSCDataForSite re-throws ReauthRequiredError (a single-site,
// awaited manual sync needs to distinguish it from a generic failure).
// A batch loop over many sites must not let one site's expired token abort
// every other site's sync - isolate it back into the normal SyncResult shape.
async function syncOneSiteIsolated(
  userId: string,
  siteId: string,
  daysBack?: number
): Promise<SyncResult> {
  try {
    return await syncGSCDataForSite(userId, siteId, daysBack);
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      return {
        success: false,
        keywordsInserted: 0,
        pagesInserted: 0,
        startDate: "",
        endDate: "",
        error: error.message,
      };
    }
    throw error;
  }
}
