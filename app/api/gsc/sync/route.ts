import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchSearchAnalytics, fetchPageAnalytics } from "@/lib/google";
import { getDateRange } from "@/lib/date-utils";

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId, daysBack: requestedDaysBack } = (await req.json()) as {
      siteId: string;
      daysBack?: number;
    };

    // Allow callers (e.g. a one-off history backfill) to widen the sync window
    // beyond the default 28 days. Clamped to keep a single request from
    // trying to pull an unbounded amount of GSC history in one shot.
    const daysBack = Math.min(
      Math.max(Number(requestedDaysBack) || 28, 1),
      500
    );

    // Verify site belongs to user
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, gscProperty: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json(
        { error: "Site not found or unauthorized" },
        { status: 404 }
      );
    }

    if (!site.gscProperty) {
      return Response.json(
        { error: "Site does not have GSC property connected" },
        { status: 400 }
      );
    }

    // Fetch last `daysBack` days of data (28 by default)
    const { start, end } = getDateRange(daysBack);

    const [keywords, pages] = await Promise.all([
      fetchSearchAnalytics(
        session.user.id,
        site.gscProperty,
        start,
        end,
        ["query", "page", "date", "device", "country"]
      ),
      fetchPageAnalytics(session.user.id, site.gscProperty, start, end),
    ]);

    // Insert/update keywords
    for (const keyword of keywords) {
      await db.keyword.upsert({
        where: {
          siteId_query_date: {
            siteId,
            query: keyword.query,
            date: new Date(keyword.date),
          },
        },
        create: {
          siteId,
          query: keyword.query,
          date: new Date(keyword.date),
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
    }

    // Insert/update pages
    for (const page of pages) {
      if (!page.page) continue;

      await db.page.upsert({
        where: {
          siteId_url_date: {
            siteId,
            url: page.page,
            date: new Date(page.date),
          },
        },
        create: {
          siteId,
          url: page.page,
          date: new Date(page.date),
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
    }

    return Response.json({
      success: true,
      keywordsInserted: keywords.length,
      pagesInserted: pages.length,
    });
  } catch (error) {
    console.error("Error syncing GSC data:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync GSC data",
      },
      { status: 500 }
    );
  }
}
