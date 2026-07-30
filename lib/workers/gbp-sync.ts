import { db } from "@/lib/db";
import { fetchGBPRawDaily, gbpLatestDataDate } from "@/lib/google";

interface GBPSyncResult {
  success: boolean;
  daysUpserted: number;
  startDate: string;
  endDate: string;
  error?: string;
}

/** How much history to backfill on each sync (roughly 18 months). */
const SYNC_WINDOW_DAYS = 550;

/**
 * Syncs Google Business Profile daily metrics for a specific site into the
 * GBPDailyMetric table. Fetches a rolling ~18-month window of raw daily values
 * and upserts one row per day.
 */
export async function syncGBPDataForSite(
  userId: string,
  siteId: string,
  daysBack: number = SYNC_WINDOW_DAYS
): Promise<GBPSyncResult> {
  try {
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, gbpLocation: true },
    });

    if (!site) {
      throw new Error("Site not found");
    }

    if (site.userId !== userId) {
      throw new Error("Unauthorized: Site does not belong to user");
    }

    if (!site.gbpLocation) {
      throw new Error("Site does not have a Business Profile location linked");
    }

    const end = gbpLatestDataDate();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (daysBack - 1));

    console.log(`[GBP Sync] Starting sync for site ${siteId} (${site.gbpLocation})`);

    const rows = await fetchGBPRawDaily(userId, site.gbpLocation, start, end);

    let daysUpserted = 0;
    for (const row of rows) {
      const date = new Date(`${row.date}T00:00:00.000Z`);
      try {
        await db.gBPDailyMetric.upsert({
          where: { siteId_date: { siteId, date } },
          create: {
            siteId,
            date,
            desktopMaps: row.desktopMaps,
            desktopSearch: row.desktopSearch,
            mobileMaps: row.mobileMaps,
            mobileSearch: row.mobileSearch,
            websiteClicks: row.websiteClicks,
            callClicks: row.callClicks,
            directionRequests: row.directionRequests,
            conversations: row.conversations,
            bookings: row.bookings,
          },
          update: {
            desktopMaps: row.desktopMaps,
            desktopSearch: row.desktopSearch,
            mobileMaps: row.mobileMaps,
            mobileSearch: row.mobileSearch,
            websiteClicks: row.websiteClicks,
            callClicks: row.callClicks,
            directionRequests: row.directionRequests,
            conversations: row.conversations,
            bookings: row.bookings,
          },
        });
        daysUpserted++;
      } catch (error) {
        console.warn(`[GBP Sync] Failed to upsert day ${row.date}`, error);
      }
    }

    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    console.log(`[GBP Sync] Sync completed: ${daysUpserted} days (${startDate} to ${endDate})`);

    return { success: true, daysUpserted, startDate, endDate };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GBP Sync] Error syncing site ${siteId}:`, errorMessage);
    return {
      success: false,
      daysUpserted: 0,
      startDate: "",
      endDate: "",
      error: errorMessage,
    };
  }
}
