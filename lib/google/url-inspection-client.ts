import { getAccessToken } from "./google-auth";

const URL_INSPECTION_API_BASE =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

/**
 * The response of urlInspection.index.inspect, as the Search Console API
 * reference documents UrlInspectionResult. Fields Google has no value for are
 * left out of the response.
 */
export interface UrlInspectionResult {
  inspectionResult: {
    inspectionResultLink?: string;
    indexStatusResult?: {
      /** PASS is "URL is on Google"; NEUTRAL is excluded; FAIL is an error. PARTIAL is no longer used. */
      verdict?: "VERDICT_UNSPECIFIED" | "PASS" | "PARTIAL" | "FAIL" | "NEUTRAL";
      /** Free text, e.g. "Submitted and indexed" or "Crawled - currently not indexed". */
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      /** RFC 3339, UTC. */
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      sitemap?: string[];
      referringUrls?: string[];
      crawledAs?: string;
    };
    /** Deprecated by Google. */
    mobileUsabilityResult?: { verdict?: string; issues?: { issueType?: string; severity?: string; message?: string }[] };
    richResultsResult?: { verdict?: string; detectedItems?: unknown[] };
  };
}

/** Google refused or failed an inspection; `status` is Google's HTTP status. */
export class UrlInspectionError extends Error {
  constructor(readonly status: number) {
    super(
      status === 429
        ? "Search Console URL Inspection quota exhausted"
        : `Search Console URL Inspection failed (HTTP ${status})`
    );
    this.name = "UrlInspectionError";
  }
}

/**
 * Inspects a URL to check its index status
 */
export async function inspectUrl(
  userId: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<UrlInspectionResult> {
  const accessToken = await getAccessToken(userId);

  const response = await fetch(URL_INSPECTION_API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inspectionUrl,
      siteUrl,
    }),
  });

  if (!response.ok) {
    // Google's body can name the property; it goes to the log, not to the caller.
    console.error(`[url-inspection] HTTP ${response.status}`, await response.text().catch(() => ""));
    throw new UrlInspectionError(response.status);
  }

  const data = (await response.json()) as UrlInspectionResult;

  return data;
}

/**
 * Checks if a URL is indexed in Google: the verdict is PASS. coverageState is
 * free text and also reads "... not indexed" for excluded URLs.
 */
export async function isUrlIndexed(
  userId: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<boolean> {
  try {
    const result = await inspectUrl(userId, siteUrl, inspectionUrl);
    return result.inspectionResult?.indexStatusResult?.verdict === "PASS";
  } catch {
    // If inspection fails, assume not indexed
    return false;
  }
}

/**
 * Gets the index status for a URL
 */
export async function getIndexStatus(
  userId: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<string | null> {
  try {
    const result = await inspectUrl(userId, siteUrl, inspectionUrl);
    return result.inspectionResult?.indexStatusResult?.coverageState || null;
  } catch {
    return null;
  }
}
