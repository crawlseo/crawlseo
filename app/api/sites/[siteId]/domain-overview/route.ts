import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { domainOverview, backlinksOverview } from "@/lib/dataforseo/client";
import { getSitePeriodMetrics } from "@/lib/seo-metrics";
import { comparableDomain, isPublicDomainName } from "@/lib/site-domain";

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

    // A typed domain is compared with the stored site normalized the same
    // way (no scheme, path or www), so your own domain, typed with or without
    // www, is your own site. DataForSEO expects a hostname without a scheme,
    // path or www prefix for a competitor; the own site is looked up as stored.
    const requestedDomain = new URL(req.url).searchParams.get("domain");
    const requested = requestedDomain === null ? null : comparableDomain(requestedDomain);
    if (requestedDomain !== null && !requested) {
      return Response.json({ error: "Invalid comparison domain" }, { status: 400 });
    }
    const isOwnSite = requested === null || requested === comparableDomain(site.domain);
    // Each lookup costs the user DataForSEO calls on their own key: refuse
    // names that can have no public data before calling the provider.
    if (!isOwnSite && !isPublicDomainName(requested)) {
      return Response.json(
        {
          error:
            "Enter a public domain such as example.com. Local names, IP addresses and reserved domains (.local, .test, .invalid, .example, .internal) have no search data.",
        },
        { status: 400 }
      );
    }
    const targetDomain = isOwnSite ? site.domain : requested;

    // Try DataForSEO
    const [domainData, backlinksData] = await Promise.all([
      domainOverview(session.user.id, targetDomain),
      backlinksOverview(session.user.id, targetDomain),
    ]);

    // Search Console data belongs to the stored site, never its competitor.
    if (domainData !== null || !isOwnSite) {
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
