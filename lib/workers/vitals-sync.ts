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
  const results: Array<
    | { url: string; device: "MOBILE"; perfScore: number; lcp?: number; cls?: number }
    | { url: string; error: string }
  > = [];

  for (const url of normalized.slice(0, limit)) {
    try {
      // Prefer mobile (ranking signal)
      const mobile = await fetchPageSpeed(url, "MOBILE", userId);
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
      const message = err instanceof Error ? err.message : "Failed";
      results.push({ url, error: message });

      // A quota error means every remaining page will fail identically -
      // stop burning requests against an already-exhausted daily quota
      // instead of retrying 4 more times for the same result.
      if (message.includes("429") || /quota exceeded/i.test(message)) {
        break;
      }
    }
  }

  // If nothing was inserted and every attempt failed, the caller (the API
  // route) needs a real error to surface - without this, "0 succeeded, all
  // failed" and "0 succeeded, nothing to check" look identical to the UI,
  // which previously showed "Saved 0 PageSpeed reports" as if it worked.
  const failures = results.filter(
    (r): r is { url: string; error: string } => "error" in r
  );
  const error =
    inserted === 0 && failures.length > 0 ? failures[0].error : undefined;

  return { inserted, results, error };
}
