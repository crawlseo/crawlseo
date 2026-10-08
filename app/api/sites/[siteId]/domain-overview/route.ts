import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { domainOverview, backlinksOverview } from "@/lib/dataforseo/client";
import { getSitePeriodMetrics } from "@/lib/seo-metrics";
import { siteDomainFromProperty } from "@/lib/site-domain";

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
      select: { userId: true, domain: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const requestedDomain = new URL(req.url).searchParams.get("domain");
    // DataForSEO expects a hostname without a scheme, path or www prefix.
    const targetDomain = requestedDomain === null
      ? site.domain
      : siteDomainFromProperty(requestedDomain)?.replace(/^www\./, "");
    if (!targetDomain) {
      return Response.json({ error: "Invalid comparison domain" }, { status: 400 });
    }

    // Try DataForSEO
    const [domainData, backlinksData] = await Promise.all([
      domainOverview(session.user.id, targetDomain),
      backlinksOverview(session.user.id, targetDomain),
    ]);

    // Search Console data belongs to the stored site, never its competitor.
    if (domainData !== null || targetDomain !== site.domain) {
      return Response.json({
        source: domainData !== null || backlinksData !== null ? "dataforseo" : "none",
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
