import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildGBPReport,
  fetchGBPSupplemental,
  gbpLatestDataDate,
  type GBPRawDaily,
} from "@/lib/google/gbp-client";
import { syncGBPDataForSite } from "@/lib/workers/gbp-sync";

const ALLOWED_DAYS = [28, 90, 180, 365];

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Maps a stored GBPDailyMetric row to the raw shape the report builder expects. */
function rowToRaw(row: {
  date: Date;
  desktopMaps: number;
  desktopSearch: number;
  mobileMaps: number;
  mobileSearch: number;
  websiteClicks: number;
  callClicks: number;
  directionRequests: number;
  conversations: number;
  bookings: number;
}): GBPRawDaily {
  return {
    date: toDateKey(row.date),
    desktopMaps: row.desktopMaps,
    desktopSearch: row.desktopSearch,
    mobileMaps: row.mobileMaps,
    mobileSearch: row.mobileSearch,
    websiteClicks: row.websiteClicks,
    callClicks: row.callClicks,
    directionRequests: row.directionRequests,
    conversations: row.conversations,
    bookings: row.bookings,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = await params;
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, gbpLocation: true, gbpLabel: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (!site.gbpLocation) {
      return Response.json({ needsSetup: true });
    }

    const daysParam = Number(new URL(req.url).searchParams.get("days"));
    const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 90;

    // Reporting window and the immediately-prior window used for deltas.
    const end = gbpLatestDataDate();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    const prevStart = new Date(start);
    prevStart.setUTCDate(prevStart.getUTCDate() - days);

    // Backfill on first load if we have no stored data for this site yet.
    const existing = await db.gBPDailyMetric.count({ where: { siteId } });
    if (existing === 0) {
      await syncGBPDataForSite(session.user.id, siteId);
    }

    const stored = await db.gBPDailyMetric.findMany({
      where: { siteId, date: { gte: prevStart, lte: end } },
      orderBy: { date: "asc" },
    });

    const rows = stored.map(rowToRaw);
    const startKey = toDateKey(start);
    const currentRows = rows.filter((r) => r.date >= startKey);
    const previousRows = rows.filter((r) => r.date < startKey);

    const supplemental = await fetchGBPSupplemental(
      session.user.id,
      site.gbpLocation,
      start,
      end
    ).catch(() => ({ searchKeywords: [], reviews: null }));

    const report = buildGBPReport({
      location: site.gbpLocation,
      days,
      startDate: startKey,
      endDate: toDateKey(end),
      currentRows,
      previousRows,
      supplemental,
    });

    return Response.json({ ...report, label: site.gbpLabel });
  } catch (error) {
    console.error("GBP report error:", error);
    return Response.json(
      { error: "Failed to load Business Profile metrics" },
      { status: 500 }
    );
  }
}
