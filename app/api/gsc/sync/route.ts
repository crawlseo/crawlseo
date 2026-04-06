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

    const { siteId } = (await req.json()) as { siteId: string };

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

    // Fetch last 28 days of data
    const { start, end } = getDateRange(28);

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
