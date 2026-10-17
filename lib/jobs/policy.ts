/*
 * The crawl rules every entry point applies: the page ceiling and the check
 * whether a site may start a crawl now. The crawl route, the MCP tool and the
 * engine all go through this module, so the page count a browser sends is
 * never the only limit. A deployment that needs stricter rules changes them
 * here, in one place.
 */

/** The page ceiling when CRAWL_MAX_PAGES is unset or invalid. */
export const DEFAULT_CRAWL_PAGE_CEILING = 2000;

/** Pages crawled when the caller does not ask for a number. */
export const DEFAULT_CRAWL_PAGES = 200;

/** CRAWL_MAX_PAGES as a whole number of pages, or the default when unset or invalid. */
export function crawlPageCeiling(env: Record<string, string | undefined> = process.env): number {
  const raw = env.CRAWL_MAX_PAGES?.trim();
  if (!raw) return DEFAULT_CRAWL_PAGE_CEILING;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_CRAWL_PAGE_CEILING;
}

/**
 * The page count a crawl actually runs with: the requested number when it is a
 * positive number, otherwise the default, and never more than the ceiling.
 */
export function clampMaxPages(requested?: unknown, ceiling: number = crawlPageCeiling()): number {
  const n =
    typeof requested === "number" && Number.isFinite(requested) && requested >= 1
      ? Math.floor(requested)
      : DEFAULT_CRAWL_PAGES;
  return Math.max(1, Math.min(n, ceiling));
}

export type CrawlPermission =
  | { ok: true }
  | { ok: false; reason: string; status: number };

export type CrawlRequestSource = "manual" | "mcp" | "schedule";

/**
 * Whether this site may start a crawl now. The open-source default allows
 * every crawl; the one-crawl-per-site rule is enforced where the crawl is
 * created. `status` is the HTTP status a refusal maps to.
 */
export type CrawlPolicy = (
  site: { id: string; userId: string },
  ctx: { source: CrawlRequestSource; maxPages: number }
) => Promise<CrawlPermission>;

export const canStartCrawl: CrawlPolicy = async () => ({ ok: true });
