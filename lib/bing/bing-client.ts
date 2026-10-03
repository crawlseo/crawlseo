import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import {
  aggregateWeekly,
  count,
  parseBingDate,
  type BingSearchWeek,
  type RawQueryStats,
} from "./bing-parse";

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

export class BingKeyMissingError extends Error {
  constructor() {
    super("No Bing Webmaster Tools API key configured. Add one in Settings.");
    this.name = "BingKeyMissingError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BingSite {
  url: string;
}

/** A counter is null when Bing left it out of the row: absent is not zero. */
export interface BingTrafficDay {
  date: string; // YYYY-MM-DD
  clicks: number | null;
  impressions: number | null;
}

export interface BingCrawlDay {
  date: string;
  crawledPages: number | null;
  inIndex: number | null;
  inLinks: number | null;
  code2xx: number | null;
  code301: number | null;
  code302: number | null;
  code4xx: number | null;
  code5xx: number | null;
  blockedByRobots: number | null;
  crawlErrors: number | null;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * The Bing key is issued per Bing Webmaster account, not per site, which is
 * exactly the grain of the ApiKey table. Like every single-key provider it is
 * stored in `encryptedPassword` with `encryptedLogin` null.
 */
export async function getBingApiKey(userId: string): Promise<string> {
  const apiKey = await db.apiKey.findUnique({
    where: { userId_provider: { userId, provider: "bing" } },
  });
  if (!apiKey) throw new BingKeyMissingError();
  return decrypt(apiKey.encryptedPassword);
}

// ---------------------------------------------------------------------------
// Base request
// ---------------------------------------------------------------------------

/**
 * Bing accepts no date range, so every call returns the full history and a
 * slow endpoint has no smaller version to fall back to. Without a deadline one
 * hung request holds the whole sync open until the platform kills it.
 */
const REQUEST_TIMEOUT_MS = 20_000;

async function bingGet<T>(
  apiKey: string,
  method: string,
  params: Record<string, string> = {}
): Promise<T> {
  const query = new URLSearchParams({ ...params, apikey: apiKey });
  const response = await fetch(`${BING_API_BASE}/${method}?${query}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();

  if (!response.ok) {
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { ErrorCode?: number; Message?: string };
      if (parsed.ErrorCode !== undefined) {
        detail = `ErrorCode ${parsed.ErrorCode}${
          parsed.Message ? ` - ${parsed.Message}` : ""
        }`;
      }
    } catch {
      // fall back to the raw body
    }
    throw new Error(`Bing ${method} failed: ${response.status} ${detail}`);
  }

  return (JSON.parse(body) as { d: T }).d;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Every verified site on the account this key belongs to. */
export async function listBingSites(userId: string): Promise<BingSite[]> {
  const apiKey = await getBingApiKey(userId);
  const sites = await bingGet<Array<{ Url: string; IsVerified?: boolean }>>(
    apiKey,
    "GetUserSites"
  );
  // Only verified properties answer the stats endpoints.
  return (sites ?? [])
    .filter((site) => site.IsVerified ?? true)
    .map((site) => ({ url: site.Url }));
}

/** Free and site-independent, which makes it the natural connection test. */
export async function testBingKey(apiKey: string): Promise<boolean> {
  try {
    await bingGet<unknown[]>(apiKey, "GetUserSites");
    return true;
  } catch {
    return false;
  }
}

/** Site clicks/impressions, one row per calendar day (~16 months of history). */
export async function fetchBingTraffic(
  apiKey: string,
  siteUrl: string
): Promise<BingTrafficDay[]> {
  const rows = await bingGet<
    Array<{ Date: string; Clicks?: number; Impressions?: number }>
  >(apiKey, "GetRankAndTrafficStats", { siteUrl });
  return (rows ?? []).map((row) => ({
    date: parseBingDate(row.Date),
    clicks: count(row.Clicks),
    impressions: count(row.Impressions),
  }));
}

/**
 * Query or page performance. Bing returns WEEKLY buckets (week ending Friday)
 * and accepts no date parameters at all - every call returns the full history.
 */
export async function fetchBingSearchStats(
  apiKey: string,
  siteUrl: string,
  kind: "query" | "page"
): Promise<BingSearchWeek[]> {
  const rows = await bingGet<RawQueryStats[]>(
    apiKey,
    kind === "query" ? "GetQueryStats" : "GetPageStats",
    { siteUrl }
  );
  return aggregateWeekly(rows ?? []);
}

/** Bing's own crawler stats, one row per day. Google exposes no equivalent API. */
export async function fetchBingCrawlStats(
  apiKey: string,
  siteUrl: string
): Promise<BingCrawlDay[]> {
  const rows = await bingGet<Array<Record<string, number | string>>>(
    apiKey,
    "GetCrawlStats",
    { siteUrl }
  );

  return (rows ?? []).map((row) => ({
    date: parseBingDate(String(row.Date)),
    crawledPages: count(row.CrawledPages),
    inIndex: count(row.InIndex),
    inLinks: count(row.InLinks),
    code2xx: count(row.Code2xx),
    code301: count(row.Code301),
    code302: count(row.Code302),
    code4xx: count(row.Code4xx),
    code5xx: count(row.Code5xx),
    blockedByRobots: count(row.BlockedByRobotsTxt),
    crawlErrors: count(row.CrawlErrors),
  }));
}
