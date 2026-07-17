import { db } from "@/lib/db";
import { fetchPageSpeed } from "@/lib/google/pagespeed-client";
import { getTopPages } from "@/lib/seo-metrics";

export async function syncVitalsForSite(
  userId: string,
  siteId: string,
  limit = 5
) {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });

  if (!site || site.userId !== userId) {
    throw new Error("Site not found or unauthorized");
  }

  const pages = await getTopPages(siteId, 28, limit);
  let urls = pages.map((p) => p.url);

  // Fallback to homepage
  if (urls.length === 0) {
    urls = [`https://${site.domain}`];
  }

  const normalized = urls.map((u) =>
    u.startsWith("http") ? u : `https://${site.domain}${u.startsWith("/") ? "" : "/"}${u}`
  );

  let inserted = 0;
  const results = [];

  for (const url of normalized.slice(0, limit)) {
    try {
      // Prefer mobile (ranking signal)
      const mobile = await fetchPageSpeed(url, "MOBILE");
      await db.vitalsReport.create({
        data: {
          siteId,
          url,
          device: "MOBILE",
          lcp: mobile.vitals.lcp,
          cls: mobile.vitals.cls,
          inp: mobile.vitals.inp,
          perfScore: mobile.metrics.perfScore,
          speedIndex: mobile.metrics.speedIndex,
          ttfb: mobile.metrics.ttfb,
        },
      });
      inserted++;
      results.push({
        url,
        device: "MOBILE",
        perfScore: mobile.metrics.perfScore,
        lcp: mobile.vitals.lcp,
        cls: mobile.vitals.cls,
      });
    } catch (err) {
      results.push({
        url,
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  return { inserted, results };
}
