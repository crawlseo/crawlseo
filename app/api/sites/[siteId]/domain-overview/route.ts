import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { domainOverview, backlinksOverview } from "@/lib/dataforseo/client";
import { getSitePeriodMetrics } from "@/lib/seo-metrics";

export async function GET(
  _req: Request,
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
      select: { userId: true, domain: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const targetDomain = site.domain;

    // Try DataForSEO
    const [domainData, backlinksData] = await Promise.all([
      domainOverview(session.user.id, targetDomain),
      backlinksOverview(session.user.id, targetDomain),
    ]);

    if (domainData !== null) {
      return Response.json({
        source: "dataforseo",
        domain: targetDomain,
        overview: domainData,
        backlinks: backlinksData,
      });
    }

    // Fallback to GSC data
    const metrics = await getSitePeriodMetrics(siteId, 28);

    const keywordCount = await db.keyword.groupBy({
      by: ["query"],
      where: {
        siteId,
        date: { gte: new Date(Date.now() - 28 * 86400000) },
      },
    });

    return Response.json({
      source: "gsc",
      domain: targetDomain,
      overview: {
        organicKeywords: keywordCount.length,
        organicTraffic: metrics.current.clicks,
        organicCost: null,
        backlinks: null,
        referringDomains: null,
      },
      backlinks: null,
      metrics,
    });
  } catch (error) {
    console.error("Domain overview error:", error);
    return Response.json(
      { error: "Domain overview failed" },
      { status: 500 }
    );
  }
}
