import { createHash } from "crypto";
import { db } from "@/lib/db";
import type { IssueSeverity, IssueType } from "@prisma/client";
import robotsParser from "robots-parser";
import { REMEDIATION } from "./remediation";

const ABSOLUTE_MAX_PAGES = 2000;
const BATCH_SIZE = 15;
const BATCH_DELAY_MS = 100;
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT =
  "CrawlSEOBot/1.0 (+https://crawlseo.dev; self-hosted SEO audit)";

type IssueInput = {
  url: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  details?: Record<string, unknown>;
};

type LinkInfo = {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string | null;
  isInternal: boolean;
  isNofollow: boolean;
  statusCode: number | null;
};

type PageSnapshot = {
  url: string;
  statusCode: number;
  redirectUrl: string | null;
  title: string | null;
  description: string | null;
  h1s: string[];
  canonical: string | null;
  robotsMeta: string | null;
  wordCount: number;
  contentScore: number;
  internalOutlinks: string[];
  externalOutlinks: string[];
  links: LinkInfo[];
  hasSchema: boolean;
  hreflangTags: { lang: string; href: string }[];
  imageCount: number;
  imagesMissingAlt: number;
  bytes: number;
  loadMs: number;
  contentHash: string;
  indexable: boolean;
};

/* ------------------------------------------------------------------ */
/*  URL helpers                                                       */
/* ------------------------------------------------------------------ */

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return (
      new URL(a).hostname.replace(/^www\./, "") ===
      new URL(b).hostname.replace(/^www\./, "")
    );
  } catch {
    return false;
  }
}

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

/* ------------------------------------------------------------------ */
/*  HTML parsing helpers                                              */
/* ------------------------------------------------------------------ */

function extractTag(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m?.[1]?.trim() || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/* ------------------------------------------------------------------ */
/*  Parse a fetched HTML page into a snapshot                         */
/* ------------------------------------------------------------------ */

function parseHtml(
  url: string,
  html: string,
  statusCode: number,
  loadMs: number,
  bytes: number,
  redirectUrl: string | null,
  seedUrl: string
): PageSnapshot {
  const titleRaw = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleRaw
    ? decodeEntities(titleRaw.replace(/\s+/g, " ").trim())
    : null;

  const description =
    extractTag(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    ) ||
    extractTag(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
    );

  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    decodeEntities(stripTags(m[1])).slice(0, 200)
  );

  const canonical =
    extractTag(
      html,
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
    ) ||
    extractTag(
      html,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i
    );

  // robots meta
  const robotsMeta =
    extractTag(
      html,
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i
    ) ||
    extractTag(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i
    );

  const hasSchema =
    /application\/ld\+json/i.test(html) ||
    /\bitemscope\b/i.test(html) ||
    /\bitemtype\b/i.test(html);

  // hreflang tags
  const hreflangTags = [
    ...html.matchAll(
      /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["'][^>]*>/gi
    ),
    ...html.matchAll(
      /<link[^>]+href=["']([^"']+)["'][^>]+hreflang=["']([^"']+)["'][^>]+rel=["']alternate["'][^>]*>/gi
    ),
  ].map((m) => {
    // The capture groups might be in different order depending on which regex matched
    // First regex: hreflang is group 1, href is group 2
    // Second regex: href is group 1, hreflang is group 2
    if (m[0].indexOf("hreflang") < m[0].indexOf("href=")) {
      return { lang: m[1], href: m[2] };
    }
    return { lang: m[2], href: m[1] };
  });

  // Images
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imageCount = imgTags.length;
  const imagesMissingAlt = imgTags.filter(
    (tag) => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)
  ).length;

  // Body text and word count
  const bodyText = stripTags(html);
  const words = bodyText ? bodyText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  // Content hash
  const contentHash = hashText(bodyText);

  // Links - extract anchor text, nofollow, internal/external
  const internalOutlinks: string[] = [];
  const externalOutlinks: string[] = [];
  const links: LinkInfo[] = [];

  const anchorMatches = [
    ...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi),
  ];
  for (const m of anchorMatches) {
    const attrs = m[1];
    const anchorContent = m[2];
    const hrefMatch = attrs.match(/href=["']([^"'#][^"']*)["']/i);
    if (!hrefMatch) continue;

    const abs = normalizeUrl(hrefMatch[1], url);
    if (!abs) continue;

    const anchorText = decodeEntities(stripTags(anchorContent)).slice(0, 200) || null;
    const isNofollow = /\brel=["'][^"']*nofollow[^"']*["']/i.test(attrs);
    const isInternal = sameHost(abs, seedUrl);

    links.push({
      sourceUrl: url,
      targetUrl: abs,
      anchorText,
      isInternal,
      isNofollow,
      statusCode: null, // filled in later for internal links
    });

    if (isInternal) {
      internalOutlinks.push(abs);
    } else {
      externalOutlinks.push(abs);
    }
  }

  // Indexable: not blocked by robots meta
  const indexable = !(
    robotsMeta &&
    (/noindex/i.test(robotsMeta))
  );

  // Simple on-page content score 0-100
  let contentScore = 40;
  if (title && title.length >= 15 && title.length <= 65) contentScore += 15;
  else if (title) contentScore += 5;
  if (description && description.length >= 50 && description.length <= 160)
    contentScore += 15;
  else if (description) contentScore += 5;
  if (h1s.length === 1) contentScore += 15;
  else if (h1s.length > 1) contentScore += 5;
  if (wordCount >= 300) contentScore += 15;
  else if (wordCount >= 100) contentScore += 8;
  if (hasSchema) contentScore += 5;
  if (canonical) contentScore += 5;
  contentScore = Math.max(0, Math.min(100, contentScore));

  return {
    url,
    statusCode,
    redirectUrl,
    title,
    description,
    h1s,
    canonical: canonical ? normalizeUrl(canonical, url) : null,
    robotsMeta,
    wordCount,
    contentScore,
    internalOutlinks: [...new Set(internalOutlinks)],
    externalOutlinks: [...new Set(externalOutlinks)],
    links,
    hasSchema,
    hreflangTags,
    imageCount,
    imagesMissingAlt,
    bytes,
    loadMs,
    contentHash,
    indexable,
  };
}

/* ------------------------------------------------------------------ */
/*  Fetch helpers                                                     */
/* ------------------------------------------------------------------ */

async function fetchPage(url: string): Promise<{
  statusCode: number;
  html: string;
  finalUrl: string;
  loadMs: number;
  bytes: number;
  contentType: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength;
    const contentType = res.headers.get("content-type") || "";
    const html =
      contentType.includes("html") || contentType.includes("xml")
        ? new TextDecoder("utf-8", { fatal: false }).decode(buf)
        : "";
    return {
      statusCode: res.status,
      html,
      finalUrl: res.url || url,
      loadMs: Date.now() - started,
      bytes,
      contentType,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) return null;
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

function parseSitemapUrls(xml: string, base: string): string[] {
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) =>
    m[1].trim()
  );
  const out: string[] = [];
  for (const loc of locs) {
    const n = normalizeUrl(loc, base);
    if (n) out.push(n);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Issue detection per page                                          */
/* ------------------------------------------------------------------ */

function issuesFromPage(page: PageSnapshot, _seedOrigin: string): IssueInput[] {
  const issues: IssueInput[] = [];
  const { url } = page;

  const rem = (type: string) => {
    const r = REMEDIATION[type];
    return r ? { howToFix: r.howToFix } : {};
  };

  if (page.statusCode >= 400) {
    issues.push({
      url,
      type: "BROKEN_LINK",
      severity: "CRITICAL",
      message: `HTTP ${page.statusCode}`,
      details: { statusCode: page.statusCode, ...rem("BROKEN_LINK") },
    });
    return issues;
  }

  if (!page.title) {
    issues.push({
      url,
      type: "MISSING_TITLE",
      severity: "CRITICAL",
      message: "Missing <title> tag",
      details: rem("MISSING_TITLE"),
    });
  }

  if (!page.description) {
    issues.push({
      url,
      type: "MISSING_DESCRIPTION",
      severity: "WARNING",
      message: "Missing meta description",
      details: rem("MISSING_DESCRIPTION"),
    });
  }

  if (page.h1s.length === 0) {
    issues.push({
      url,
      type: "MISSING_H1",
      severity: "WARNING",
      message: "No H1 heading found",
      details: rem("MISSING_H1"),
    });
  } else if (page.h1s.length > 1) {
    issues.push({
      url,
      type: "MULTIPLE_H1",
      severity: "INFO",
      message: `${page.h1s.length} H1 headings found`,
      details: { h1s: page.h1s, ...rem("MULTIPLE_H1") },
    });
  }

  if (page.imagesMissingAlt > 0) {
    issues.push({
      url,
      type: "MISSING_ALT",
      severity: "WARNING",
      message: `${page.imagesMissingAlt}/${page.imageCount} images missing alt`,
      details: {
        missing: page.imagesMissingAlt,
        total: page.imageCount,
        ...rem("MISSING_ALT"),
      },
    });
  }

  if (!page.canonical) {
    issues.push({
      url,
      type: "MISSING_CANONICAL",
      severity: "INFO",
      message: "No canonical tag",
      details: rem("MISSING_CANONICAL"),
    });
  }

  if (!page.hasSchema) {
    issues.push({
      url,
      type: "MISSING_SCHEMA",
      severity: "INFO",
      message: "No structured data (JSON-LD / microdata)",
      details: rem("MISSING_SCHEMA"),
    });
  }

  if (page.loadMs > 3000) {
    issues.push({
      url,
      type: "SLOW_PAGE",
      severity: "WARNING",
      message: `Slow response: ${page.loadMs}ms`,
      details: { loadMs: page.loadMs, ...rem("SLOW_PAGE") },
    });
  }

  if (page.bytes > 3 * 1024 * 1024) {
    issues.push({
      url,
      type: "LARGE_PAGE",
      severity: "WARNING",
      message: `Large HTML payload: ${(page.bytes / 1024 / 1024).toFixed(1)}MB`,
      details: { bytes: page.bytes, ...rem("LARGE_PAGE") },
    });
  }

  return issues;
}

function computeHealthScore(issues: IssueInput[], pagesFound: number): number {
  if (pagesFound === 0) return 0;
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "CRITICAL") score -= 8;
    else if (issue.severity === "WARNING") score -= 3;
    else score -= 1;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/* ------------------------------------------------------------------ */
/*  Main crawl result type                                            */
/* ------------------------------------------------------------------ */

export type CrawlResult = {
  crawlId: string;
  pagesFound: number;
  issuesFound: number;
  healthScore: number;
  sitemapUrls: number;
  missingFromSitemap: number;
  orphanCandidates: number;
  avgContentScore: number;
};

/* ------------------------------------------------------------------ */
/*  Main crawl function                                               */
/* ------------------------------------------------------------------ */

/**
 * Crawl a site starting from domain root (+ sitemap).
 * Supports up to 2000 pages with concurrent batch fetching.
 */
export async function runSiteCrawl(
  siteId: string,
  domain: string,
  maxPages: number = 200,
  existingCrawlId?: string
): Promise<CrawlResult> {
  const effectiveMax = Math.max(1, Math.min(maxPages, ABSOLUTE_MAX_PAGES));
  const seed = domain.startsWith("http") ? domain : `https://${domain}`;
  const seedUrl = normalizeUrl(seed, seed) || seed;
  const origin = originOf(seedUrl);

  const crawl = existingCrawlId
    ? await db.crawl.update({
        where: { id: existingCrawlId },
        data: { status: "RUNNING", startedAt: new Date() },
      })
    : await db.crawl.create({
        data: {
          siteId,
          status: "RUNNING",
          startedAt: new Date(),
        },
      });

  try {
    return await executeCrawl(crawl.id, siteId, seedUrl, origin, effectiveMax);
  } catch (err) {
    // Mark crawl as failed on any unhandled error
    await db.crawl
      .update({
        where: { id: crawl.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
        },
      })
      .catch(() => {}); // swallow DB errors during cleanup
    throw err;
  }
}

async function executeCrawl(
  crawlId: string,
  _siteId: string,
  seedUrl: string,
  origin: string,
  maxPages: number
): Promise<CrawlResult> {
  const issues: IssueInput[] = [];
  const pages: PageSnapshot[] = [];
  const allLinks: LinkInfo[] = [];
  const visited = new Set<string>();
  const queue: string[] = [seedUrl];

  /* ---- robots.txt ---- */
  const robotsUrl = `${origin}/robots.txt`;
  const robotsText = await fetchText(robotsUrl);

  let robotsChecker: ReturnType<typeof robotsParser> | null = null;
  if (!robotsText) {
    issues.push({
      url: robotsUrl,
      type: "MISSING_ROBOTS",
      severity: "WARNING",
      message: "robots.txt not found or unreachable",
      details: REMEDIATION.MISSING_ROBOTS
        ? { howToFix: REMEDIATION.MISSING_ROBOTS.howToFix }
        : {},
    });
  } else {
    robotsChecker = robotsParser(robotsUrl, robotsText);
  }

  /* ---- Sitemap discovery ---- */
  let sitemapUrls: string[] = [];
  const sitemapCandidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ];
  if (robotsText) {
    const sm = robotsText.match(/Sitemap:\s*(\S+)/i);
    if (sm?.[1]) sitemapCandidates.unshift(sm[1]);
  }

  for (const smUrl of sitemapCandidates) {
    const xml = await fetchText(smUrl);
    if (!xml) continue;
    if (xml.includes("<sitemapindex")) {
      const childSitemaps = parseSitemapUrls(xml, origin).slice(0, 5);
      for (const child of childSitemaps) {
        const childXml = await fetchText(child);
        if (childXml) sitemapUrls.push(...parseSitemapUrls(childXml, origin));
      }
    } else {
      sitemapUrls.push(...parseSitemapUrls(xml, origin));
    }
    if (sitemapUrls.length) break;
  }

  sitemapUrls = [...new Set(sitemapUrls.filter((u) => sameHost(u, seedUrl)))];
  if (sitemapUrls.length === 0) {
    issues.push({
      url: `${origin}/sitemap.xml`,
      type: "MISSING_SITEMAP",
      severity: "WARNING",
      message: "No sitemap.xml found",
      details: REMEDIATION.MISSING_SITEMAP
        ? { howToFix: REMEDIATION.MISSING_SITEMAP.howToFix }
        : {},
    });
  } else {
    // Seed queue from sitemap
    for (const u of sitemapUrls.slice(0, 100)) {
      if (!queue.includes(u)) queue.push(u);
    }
  }

  /* ---- Crawl loop with batch concurrency ---- */
  while (queue.length > 0 && pages.length < maxPages) {
    // Collect the next batch of unvisited URLs
    const batch: string[] = [];
    while (batch.length < BATCH_SIZE && queue.length > 0 && pages.length + batch.length < maxPages) {
      const next = queue.shift()!;
      const normalized = normalizeUrl(next, origin);
      if (!normalized || visited.has(normalized)) continue;
      if (!sameHost(normalized, seedUrl)) continue;

      // Check robots.txt. isAllowed() returns `undefined` (not `false`) when
      // the URL's host differs from the one robots.txt was fetched from —
      // e.g. an apex domain that redirects to www. sameHost() above already
      // confirms it's the same site, so only an explicit `false` (a real
      // Disallow match) should block the crawl here.
      if (robotsChecker && robotsChecker.isAllowed(normalized, USER_AGENT) === false) {
        visited.add(normalized);
        continue;
      }

      visited.add(normalized);
      batch.push(normalized);
    }

    if (batch.length === 0) break;

    // Fetch all pages in the batch concurrently
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const res = await fetchPage(url);
          return { url, res, error: null };
        } catch (err) {
          return { url, res: null, error: err };
        }
      })
    );

    for (const result of results) {
      if (result.status === "rejected") continue;
      const { url, res, error } = result.value;

      if (error || !res) {
        issues.push({
          url,
          type: "BROKEN_LINK",
          severity: "CRITICAL",
          message:
            error instanceof Error ? error.message : "Fetch failed",
          details: { howToFix: REMEDIATION.BROKEN_LINK?.howToFix },
        });
        continue;
      }

      if (!res.contentType.includes("html") && res.statusCode < 400) {
        continue;
      }

      const finalNormalized = normalizeUrl(res.finalUrl, origin) || url;
      const redirectUrl =
        finalNormalized !== url ? finalNormalized : null;

      // A redirect can resolve to a URL that's also seeded from the sitemap or
      // linked elsewhere. Only the requested URL was marked visited, so without
      // this the resolved page gets fetched and stored twice — inflating page
      // counts and producing phantom DUPLICATE_TITLE/DESCRIPTION issues.
      if (redirectUrl) {
        if (visited.has(finalNormalized)) continue;
        visited.add(finalNormalized);
      }

      const page = parseHtml(
        finalNormalized,
        res.html,
        res.statusCode,
        res.loadMs,
        res.bytes,
        redirectUrl,
        seedUrl
      );

      // Mixed content check on raw HTML
      if (
        page.url.startsWith("https://") &&
        /(?:src|href)=["']http:\/\//i.test(res.html)
      ) {
        issues.push({
          url: page.url,
          type: "MIXED_CONTENT",
          severity: "WARNING",
          message: "Page loads insecure HTTP resources",
          details: { howToFix: REMEDIATION.MIXED_CONTENT?.howToFix },
        });
      }

      pages.push(page);
      allLinks.push(...page.links);
      issues.push(...issuesFromPage(page, origin));

      // Enqueue discovered internal links
      for (const link of page.internalOutlinks) {
        if (!visited.has(link)) {
          queue.push(link);
        }
      }
    }

    // Small delay between batches to avoid hammering the target
    if (queue.length > 0 && pages.length < maxPages) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  /* ---- Duplicate titles / descriptions ---- */
  const byTitle = new Map<string, string[]>();
  const byDesc = new Map<string, string[]>();
  for (const p of pages) {
    if (p.title) {
      const list = byTitle.get(p.title) || [];
      list.push(p.url);
      byTitle.set(p.title, list);
    }
    if (p.description) {
      const list = byDesc.get(p.description) || [];
      list.push(p.url);
      byDesc.set(p.description, list);
    }
  }
  for (const [title, urls] of byTitle) {
    if (urls.length > 1) {
      for (const url of urls) {
        issues.push({
          url,
          type: "DUPLICATE_TITLE",
          severity: "WARNING",
          message: `Duplicate title shared by ${urls.length} pages`,
          details: {
            title,
            urls,
            howToFix: REMEDIATION.DUPLICATE_TITLE?.howToFix,
          },
        });
      }
    }
  }
  for (const [description, urls] of byDesc) {
    if (urls.length > 1) {
      for (const url of urls) {
        issues.push({
          url,
          type: "DUPLICATE_DESCRIPTION",
          severity: "INFO",
          message: `Duplicate meta description on ${urls.length} pages`,
          details: {
            description,
            urls,
            howToFix: REMEDIATION.DUPLICATE_DESCRIPTION?.howToFix,
          },
        });
      }
    }
  }

  /* ---- Sitemap coverage & orphan detection ---- */
  const crawledSet = new Set(pages.map((p) => p.url));
  const sitemapSet = new Set(sitemapUrls);
  const missingFromSitemap = [...crawledSet].filter(
    (u) => sitemapSet.size > 0 && !sitemapSet.has(u)
  );

  const inlinkCount = new Map<string, number>();
  for (const p of pages) {
    for (const out of p.internalOutlinks) {
      inlinkCount.set(out, (inlinkCount.get(out) || 0) + 1);
    }
  }
  const orphans = pages.filter((p) => {
    const isHome = new URL(p.url).pathname === "/" || p.url === seedUrl;
    return !isHome && (inlinkCount.get(p.url) || 0) === 0;
  });

  for (const url of missingFromSitemap.slice(0, 50)) {
    issues.push({
      url,
      type: "MISSING_SITEMAP",
      severity: "INFO",
      message: "Crawled page not listed in sitemap",
      details: {
        kind: "not_in_sitemap",
        howToFix: REMEDIATION.MISSING_SITEMAP?.howToFix,
      },
    });
  }

  for (const p of orphans.slice(0, 50)) {
    issues.push({
      url: p.url,
      type: "MISSING_CANONICAL",
      severity: "WARNING",
      message: "Potential orphan page (no internal inlinks found)",
      details: { kind: "orphan", contentScore: p.contentScore },
    });
  }

  /* ---- Compute scores ---- */
  const healthScore = computeHealthScore(issues, pages.length);
  const avgContentScore =
    pages.length > 0
      ? Math.round(
          pages.reduce((s, p) => s + p.contentScore, 0) / pages.length
        )
      : 0;

  /* ---- Persist AuditPage records ---- */
  if (pages.length > 0) {
    // Batch in chunks to avoid overly large createMany calls
    const PAGE_BATCH = 100;
    for (let i = 0; i < pages.length; i += PAGE_BATCH) {
      const chunk = pages.slice(i, i + PAGE_BATCH);
      await db.auditPage.createMany({
        data: chunk.map((p) => ({
          crawlId,
          url: p.url,
          statusCode: p.statusCode,
          redirectUrl: p.redirectUrl,
          title: p.title,
          description: p.description,
          canonical: p.canonical,
          robotsMeta: p.robotsMeta,
          h1Count: p.h1s.length,
          h1s: p.h1s,
          wordCount: p.wordCount,
          imageCount: p.imageCount,
          imagesMissingAlt: p.imagesMissingAlt,
          internalLinks: p.internalOutlinks.length,
          externalLinks: p.externalOutlinks.length,
          hasSchema: p.hasSchema,
          hreflangTags: p.hreflangTags.length > 0 ? p.hreflangTags : undefined,
          contentScore: p.contentScore,
          contentHash: p.contentHash,
          responseTimeMs: p.loadMs,
          byteSize: p.bytes,
          indexable: p.indexable,
        })),
      });
    }
  }

  /* ---- Persist AuditLink records ---- */
  if (allLinks.length > 0) {
    const LINK_BATCH = 200;
    // Cap total links to avoid blowing up storage
    const linksToStore = allLinks.slice(0, 10000);
    for (let i = 0; i < linksToStore.length; i += LINK_BATCH) {
      const chunk = linksToStore.slice(i, i + LINK_BATCH);
      await db.auditLink.createMany({
        data: chunk.map((l) => ({
          crawlId,
          sourceUrl: l.sourceUrl,
          targetUrl: l.targetUrl,
          anchorText: l.anchorText,
          isInternal: l.isInternal,
          isNofollow: l.isNofollow,
          statusCode: l.statusCode,
        })),
      });
    }
  }

  /* ---- Persist CrawlIssue records ---- */
  const toSave = issues.slice(0, 1000);
  if (toSave.length) {
    await db.crawlIssue.createMany({
      data: toSave.map((i) => ({
        crawlId,
        url: i.url,
        type: i.type,
        severity: i.severity,
        message: i.message,
        details: (i.details ?? undefined) as undefined | Record<string, string | number | boolean | null>,
      })),
    });
  }

  // Thin content pages as INFO issues
  const thin = pages.filter((p) => p.contentScore < 60);
  if (thin.length) {
    await db.crawlIssue.createMany({
      data: thin.slice(0, 50).map((p) => ({
        crawlId,
        url: p.url,
        type: "MISSING_DESCRIPTION" as IssueType,
        severity: "INFO" as IssueSeverity,
        message: `On-page content score ${p.contentScore}/100 (${p.wordCount} words)`,
        details: {
          kind: "content_score",
          contentScore: p.contentScore,
          wordCount: p.wordCount,
          title: p.title,
          h1Count: p.h1s.length,
        },
      })),
    });
  }

  // Crawl summary issue
  await db.crawlIssue.create({
    data: {
      crawlId,
      url: seedUrl,
      type: "MISSING_SCHEMA",
      severity: "INFO",
      message: "Crawl summary",
      details: {
        kind: "crawl_summary",
        pages: pages.map((p) => ({
          url: p.url,
          statusCode: p.statusCode,
          title: p.title,
          contentScore: p.contentScore,
          wordCount: p.wordCount,
          outlinks: p.internalOutlinks.length,
          externalOutlinks: p.externalOutlinks.length,
          inlinks: inlinkCount.get(p.url) || 0,
        })),
        sitemapUrls: sitemapUrls.length,
        missingFromSitemap: missingFromSitemap.length,
        orphans: orphans.length,
        avgContentScore,
      },
    },
  });

  /* ---- Finalize crawl record ---- */
  const finalIssues = await db.crawlIssue.count({
    where: { crawlId },
  });

  await db.crawl.update({
    where: { id: crawlId },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      pagesFound: pages.length,
      issuesFound: finalIssues,
      healthScore,
    },
  });

  return {
    crawlId,
    pagesFound: pages.length,
    issuesFound: finalIssues,
    healthScore,
    sitemapUrls: sitemapUrls.length,
    missingFromSitemap: missingFromSitemap.length,
    orphanCandidates: orphans.length,
    avgContentScore,
  };
}
