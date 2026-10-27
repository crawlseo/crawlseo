import type { KeyOwner } from "@/lib/access-keys";
import { apiRateLimitPerMinute, RateLimiter } from "@/lib/rate-limit";
import { checkKey } from "./auth";
import * as read from "./handlers";
import { ApiError } from "./params";

/*
 * The read-only API under /api/v1, for the MCP server and scripts. Every
 * request carries an access key (Authorization: Bearer <key>) of a user with
 * MCP turned on in Settings > MCP, and reads the data of that user only. GET is the only method: nothing here writes,
 * queues or triggers anything.
 *
 * GET /api/v1/key                                  the key in use: name and prefix
 * GET /api/v1/sites
 * GET /api/v1/sites/{siteId}                       overview: last 28 days, latest crawl and vitals
 * GET /api/v1/sites/{siteId}/keywords              ?days= or ?startDate=&endDate=, &limit=
 * GET /api/v1/sites/{siteId}/pages                 the same
 * GET /api/v1/sites/{siteId}/traffic               daily clicks and impressions, the same period
 * GET /api/v1/sites/{siteId}/crawls                ?limit=
 * GET /api/v1/sites/{siteId}/crawls/{id}/issues    id or "latest", ?severity=&limit=
 * GET /api/v1/sites/{siteId}/vitals                ?device=&limit=
 * GET /api/v1/sites/{siteId}/opportunities
 * GET /api/v1/sites/{siteId}/bing/traffic          Bing daily rows, ?days= or ?startDate=&endDate=
 * GET /api/v1/sites/{siteId}/bing/keywords         Bing weekly queries summed over the period, &limit=
 * GET /api/v1/sites/{siteId}/bing/pages            the same for pages
 * GET /api/v1/sites/{siteId}/saved-keywords       saved keywords with their totals, ?days= or ?startDate=&endDate=
 */

const PREFIX = "/api/v1/";

const holder = globalThis as unknown as { crawlseoApiRateLimiter?: RateLimiter };

function limiter(): RateLimiter {
  const limit = apiRateLimitPerMinute();
  if (holder.crawlseoApiRateLimiter?.limit !== limit) holder.crawlseoApiRateLimiter = new RateLimiter(limit);
  return holder.crawlseoApiRateLimiter;
}

export type RateCheck = { ok: boolean; headers: Record<string, string> };

/** Counts one request of the key against API_RATE_LIMIT_PER_MINUTE; /api/v1 and /mcp share the count. */
export function countKeyRequest(keyId: string): RateCheck {
  const rate = limiter().hit(keyId);
  const headers: Record<string, string> = { "X-RateLimit-Limit": String(rate.limit), "X-RateLimit-Remaining": String(rate.remaining) };
  if (!rate.ok) headers["Retry-After"] = String(rate.retryAfterS);
  return { ok: rate.ok, headers };
}

export const RATE_LIMITED_MESSAGE = "Too many requests for this key. Try again shortly.";

function segment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    throw new ApiError(404, "Not found");
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

async function route(owner: KeyOwner, segments: string[], params: URLSearchParams): Promise<unknown> {
  const { userId } = owner;
  const [root, siteId, resource, crawlId, sub] = segments;
  if (root === "key" && segments.length === 1) return read.keyInfo(owner.keyId);
  if (root !== "sites") throw new ApiError(404, "Not found");
  if (segments.length === 1) return read.listSites(userId);

  const site = await read.ownSite(userId, siteId);
  if (segments.length === 2) return read.siteOverview(site);
  if (segments.length === 3) {
    switch (resource) {
      case "keywords":
        return read.keywords(site, params);
      case "pages":
        return read.pages(site, params);
      case "traffic":
        return read.traffic(site, params);
      case "crawls":
        return read.crawls(site, params);
      case "vitals":
        return read.vitals(site, params);
      case "opportunities":
        return read.opportunities(site);
      case "saved-keywords":
        return read.savedKeywords(site, params);
    }
  }
  if (segments.length === 4 && resource === "bing") {
    switch (segments[3]) {
      case "traffic":
        return read.bingTraffic(site, params);
      case "keywords":
        return read.bingKeywords(site, params);
      case "pages":
        return read.bingPages(site, params);
    }
  }
  if (segments.length === 5 && resource === "crawls" && sub === "issues") {
    return read.crawlIssues(site, crawlId, params);
  }
  throw new ApiError(404, "Not found");
}

/** Answers one /api/v1 request. Used by the route and, in-process, by the instance's MCP endpoint. */
export async function handleApiV1(req: Request, opts: { countRequest?: boolean } = {}): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "The API is read-only: GET only" }, 405, { Allow: "GET" });
  }

  try {
    const check = await checkKey(req);
    if (!check.ok) return json({ error: check.error }, check.status, check.headers);
    const { owner } = check;

    // A tool call from /mcp was counted there, as one request.
    const rate = opts.countRequest === false ? { ok: true, headers: {} } : countKeyRequest(owner.keyId);
    const rateHeaders = rate.headers;
    if (!rate.ok) return json({ error: RATE_LIMITED_MESSAGE }, 429, rateHeaders);

    const url = new URL(req.url);
    const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : "";
    const segments = path.split("/").filter(Boolean).map(segment);
    return json(await route(owner, segments, url.searchParams), 200, rateHeaders);
  } catch (err) {
    if (err instanceof ApiError) return json({ error: err.message }, err.status);
    console.error("[api/v1]", err);
    return json({ error: "Internal error" }, 500);
  }
}
