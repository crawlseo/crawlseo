const PAGESPEED_API_BASE = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface CoreWebVitals {
  lcp?: number; // Largest Contentful Paint (seconds)
  fid?: number; // First Input Delay (milliseconds) - deprecated
  cls?: number; // Cumulative Layout Shift (score)
  inp?: number; // Interaction to Next Paint (milliseconds)
}

export interface PerformanceMetrics {
  perfScore: number; // 0-100
  speedIndex?: number; // seconds
  ttfb?: number; // Time to First Byte (seconds)
  fcp?: number; // First Contentful Paint (seconds)
}

export interface PageSpeedResult {
  url: string;
  strategy: "MOBILE" | "DESKTOP";
  lighthouseScore: number;
  vitals: CoreWebVitals;
  metrics: PerformanceMetrics;
  fetchTime: string;
}

/**
 * Converts milliseconds to seconds
 */
function msToSeconds(ms?: number): number | undefined {
  return ms ? ms / 1000 : undefined;
}

/**
 * Fetches PageSpeed Insights data for a URL
 */
export async function fetchPageSpeed(
  url: string,
  strategy: "MOBILE" | "DESKTOP" = "MOBILE"
): Promise<PageSpeedResult> {
  const params = new URLSearchParams({
    url,
    category: "PERFORMANCE",
    strategy,
  });
  if (process.env.GOOGLE_PAGESPEED_KEY) {
    params.set("key", process.env.GOOGLE_PAGESPEED_KEY);
  }

  const response = await fetch(`${PAGESPEED_API_BASE}?${params}`, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to fetch PageSpeed data: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}. Set GOOGLE_PAGESPEED_KEY for reliable quota.`
    );
  }

  const data = (await response.json()) as {
    lighthouseResult?: {
      categories?: {
        performance?: {
          score?: number;
        };
      };
      audits?: Record<
        string,
        {
          numericValue?: number;
        }
      >;
    };
  };

  const lighthouseResult = data.lighthouseResult;

  if (!lighthouseResult) {
    throw new Error("Invalid PageSpeed response: missing lighthouseResult");
  }

  const audits = lighthouseResult.audits || {};

  // Extract Core Web Vitals
  const vitals: CoreWebVitals = {
    lcp: msToSeconds(audits["largest-contentful-paint"]?.numericValue),
    cls: audits["cumulative-layout-shift"]?.numericValue,
    inp: audits["interaction-to-next-paint"]?.numericValue,
  };

  // Extract performance metrics
  const metrics: PerformanceMetrics = {
    perfScore: Math.round(
      (lighthouseResult.categories?.performance?.score || 0) * 100
    ),
    speedIndex: msToSeconds(audits["speed-index"]?.numericValue),
    ttfb: msToSeconds(audits["server-response-time"]?.numericValue),
    fcp: msToSeconds(audits["first-contentful-paint"]?.numericValue),
  };

  return {
    url,
    strategy,
    lighthouseScore: metrics.perfScore,
    vitals,
    metrics,
    fetchTime: new Date().toISOString(),
  };
}

/**
 * Fetches PageSpeed data for both mobile and desktop
 */
export async function fetchPageSpeedBoth(
  url: string
): Promise<{ mobile: PageSpeedResult; desktop: PageSpeedResult }> {
  const [mobile, desktop] = await Promise.all([
    fetchPageSpeed(url, "MOBILE"),
    fetchPageSpeed(url, "DESKTOP"),
  ]);

  return { mobile, desktop };
}

/**
 * Checks if Core Web Vitals are "good" (passing thresholds)
 */
export function isVitalsGood(vitals: CoreWebVitals): boolean {
  // Good thresholds according to Google
  // LCP: < 2.5s
  // CLS: < 0.1
  // INP: < 200ms

  const lcpGood = vitals.lcp ? vitals.lcp < 2.5 : true;
  const clsGood = vitals.cls ? vitals.cls < 0.1 : true;
  const inpGood = vitals.inp ? vitals.inp < 200 : true;

  return lcpGood && clsGood && inpGood;
}

/**
 * Gets a performance grade from score
 */
export function getPerformanceGrade(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Needs Improvement";
  return "Poor";
}
