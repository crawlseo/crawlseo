import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import {
  aggregateWeekly,
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
  isVerified: boolean;
}

export interface BingTrafficDay {
  date: string; // YYYY-MM-DD
  clicks: number;
  impressions: number;
}

export interface BingCrawlDay {
  date: string;
  crawledPages: number;
  inIndex: number;
  inLinks: number;
  code2xx: number;
  code301: number;
  code302: number;
  code4xx: number;
  code5xx: number;
  blockedByRobots: number;
  crawlErrors: number;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * The Bing key is issued per Bing Webmaster account, not per site, which is
 * exactly the grain of the ApiKey table. It is stored in `encryptedLogin`;
 * `encryptedPassword` is unused (the model was shaped for DataForSEO's pair).
 */
export async function getBingApiKey(userId: string): Promise<string> {
  const apiKey = await db.apiKey.findUnique({
    where: { userId_provider: { userId, provider: "bing" } },
  });
  if (!apiKey) throw new BingKeyMissingError();
  return decrypt(apiKey.encryptedLogin);
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
  return (sites ?? []).map((site) => ({
    url: site.Url,
    isVerified: site.IsVerified ?? true,
  }));
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
  userId: string,
  siteUrl: string
): Promise<BingTrafficDay[]> {
  const apiKey = await getBingApiKey(userId);
  const rows = await bingGet<
    Array<{ Date: string; Clicks: number; Impressions: number }>
  >(apiKey, "GetRankAndTrafficStats", { siteUrl });
  return (rows ?? []).map((row) => ({
    date: parseBingDate(row.Date),
    clicks: row.Clicks ?? 0,
    impressions: row.Impressions ?? 0,
  }));
}

/**
 * Query or page performance. Bing returns WEEKLY buckets (week ending Friday)
 * and accepts no date parameters at all - every call returns the full history.
 */
export async function fetchBingSearchStats(
  userId: string,
  siteUrl: string,
  kind: "query" | "page"
): Promise<BingSearchWeek[]> {
  const apiKey = await getBingApiKey(userId);
  const rows = await bingGet<RawQueryStats[]>(
    apiKey,
    kind === "query" ? "GetQueryStats" : "GetPageStats",
    { siteUrl }
  );
  return aggregateWeekly(rows ?? []);
}

/** Bing's own crawler stats, one row per day. Google exposes no equivalent API. */
export async function fetchBingCrawlStats(
  userId: string,
  siteUrl: string
): Promise<BingCrawlDay[]> {
  const apiKey = await getBingApiKey(userId);
  const rows = await bingGet<Array<Record<string, number | string>>>(
    apiKey,
    "GetCrawlStats",
    { siteUrl }
  );

  return (rows ?? []).map((row) => ({
    date: parseBingDate(String(row.Date)),
    crawledPages: Number(row.CrawledPages ?? 0),
    inIndex: Number(row.InIndex ?? 0),
    inLinks: Number(row.InLinks ?? 0),
    code2xx: Number(row.Code2xx ?? 0),
    code301: Number(row.Code301 ?? 0),
    code302: Number(row.Code302 ?? 0),
    code4xx: Number(row.Code4xx ?? 0),
    code5xx: Number(row.Code5xx ?? 0),
    blockedByRobots: Number(row.BlockedByRobotsTxt ?? 0),
    crawlErrors: Number(row.CrawlErrors ?? 0),
  }));
}
