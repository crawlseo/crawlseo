/*
 * noindex detection (#105).
 *
 * A page is noindex when Google is told not to index it, by either source:
 *   - a `<meta name="robots">` or `<meta name="googlebot">` tag whose content
 *     lists `noindex` or `none` (names and values are case-insensitive, the
 *     content is a comma-separated list, every such tag counts);
 *   - an X-Robots-Tag response header that does the same, either for every
 *     crawler (`noindex`) or for Googlebot (`googlebot: noindex`).
 * Directives addressed to another crawler (`<meta name="bingbot">`,
 * `bingbot: noindex`) are ignored. The sources are combined the way Google
 * combines them: the most restrictive wins, so `index` in one place never
 * cancels `noindex` in another.
 */

/** Crawler names whose directives decide indexing. */
const GOOGLE_BOTS = new Set(["googlebot"]);

/** Directives that take a value after a colon, so a `name:` prefix is not a crawler. */
const VALUED_DIRECTIVES = new Set([
  "unavailable_after",
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
]);

export type NoindexSource = "meta" | "x-robots-tag";

/** True when a comma-separated directive list holds `noindex` or `none`. */
function listHasNoindex(content: string): boolean {
  return content
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .some((d) => d === "noindex" || d === "none");
}

/**
 * True when the meta robots contents say noindex. `metas` are the
 * `[name, content]` pairs of the page's `<meta>` tags; only `robots` and
 * `googlebot` count.
 */
export function metaSaysNoindex(metas: [name: string, content: string][]): boolean {
  return metas.some(([name, content]) => {
    const n = name.trim().toLowerCase();
    return (n === "robots" || GOOGLE_BOTS.has(n)) && listHasNoindex(content);
  });
}

/**
 * True when the X-Robots-Tag values say noindex for every crawler or for
 * Googlebot. Each value is one header line; a line may hold a comma list and
 * may start with `botname:`, which scopes the directives after it, up to the
 * next `botname:`, to that crawler.
 *
 * fetch() joins repeated headers into one value with ", ", which loses where
 * one header ended. A second header without a crawler prefix is then read as
 * belonging to the crawler named in the first one. That is the same reading
 * Google documents for a single header line, and the safe side for us: it can
 * only miss a noindex, never invent one.
 */
export function headerSaysNoindex(values: string[]): boolean {
  for (const value of values) {
    let bot: string | null = null;
    for (const raw of value.split(",")) {
      let token = raw.trim().toLowerCase();
      if (!token) continue;
      const colon = token.indexOf(":");
      if (colon > 0) {
        const head = token.slice(0, colon).trim();
        if (!VALUED_DIRECTIVES.has(head) && /^[a-z0-9._-]+$/.test(head)) {
          bot = head;
          token = token.slice(colon + 1).trim();
        }
      }
      if ((bot === null || GOOGLE_BOTS.has(bot)) && (token === "noindex" || token === "none")) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Where a page is told noindex: empty when it is indexable, both sources
 * when both say so.
 */
export function noindexSources(
  metas: [name: string, content: string][],
  headerValues: string[]
): NoindexSource[] {
  const out: NoindexSource[] = [];
  if (metaSaysNoindex(metas)) out.push("meta");
  if (headerSaysNoindex(headerValues)) out.push("x-robots-tag");
  return out;
}
