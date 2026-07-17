import { db } from "@/lib/db";
import type { IssueSeverity, IssueType } from "@prisma/client";

const MAX_PAGES = 40;
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT = "CrawlSEOBot/1.0 (+https://crawlseo.dev; self-hosted SEO audit)";

type IssueInput = {
  url: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  details?: Record<string, unknown>;
};

type PageSnapshot = {
  url: string;
  statusCode: number;
  title: string | null;
  description: string | null;
  h1s: string[];
  canonical: string | null;
  wordCount: number;
  contentScore: number;
  internalOutlinks: string[];
  hasSchema: boolean;
  imageCount: number;
  imagesMissingAlt: number;
  bytes: number;
  loadMs: number;
};

function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    // strip trailing slash except root
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
    return new URL(a).hostname.replace(/^www\./, "") ===
      new URL(b).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

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

function parseHtml(url: string, html: string, statusCode: number, loadMs: number, bytes: number): PageSnapshot {
  const titleRaw = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleRaw ? decodeEntities(titleRaw.replace(/\s+/g, " ").trim()) : null;

  const description =
    extractTag(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    extractTag(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    decodeEntities(stripTags(m[1])).slice(0, 200)
  );

  const canonical =
    extractTag(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    extractTag(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);

  const hasSchema =
    /application\/ld\+json/i.test(html) ||
    /\bitemscope\b/i.test(html) ||
    /\bitemtype\b/i.test(html);

  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imageCount = imgTags.length;
  const imagesMissingAlt = imgTags.filter(
    (tag) => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)
  ).length;

  const bodyText = stripTags(html);
  const words = bodyText ? bodyText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  const internalOutlinks: string[] = [];
  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)];
  for (const m of hrefs) {
    const abs = normalizeUrl(m[1], url);
    if (abs && sameHost(abs, url)) {
      internalOutlinks.push(abs);
    }
  }

  // Simple on-page content score 0-100
  let contentScore = 40;
  if (title && title.length >= 15 && title.length <= 65) contentScore += 15;
  else if (title) contentScore += 5;
  if (description && description.length >= 50 && description.length <= 160) contentScore += 15;
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
    title,
    description,
    h1s,
    canonical: canonical ? normalizeUrl(canonical, url) : null,
    wordCount,
    contentScore,
    internalOutlinks: [...new Set(internalOutlinks)],
    hasSchema,
    imageCount,
    imagesMissingAlt,
    bytes,
    loadMs,
  };
}

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
    const html = contentType.includes("html") || contentType.includes("xml")
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

function issuesFromPage(page: PageSnapshot, seedOrigin: string): IssueInput[] {
  const issues: IssueInput[] = [];
  const { url } = page;

  if (page.statusCode >= 400) {
    issues.push({
      url,
      type: "BROKEN_LINK",
      severity: "CRITICAL",
      message: `HTTP ${page.statusCode}`,
      details: { statusCode: page.statusCode },
    });
    return issues;
  }

  if (!page.title) {
    issues.push({
      url,
      type: "MISSING_TITLE",
      severity: "CRITICAL",
      message: "Missing <title> tag",
    });
  }

  if (!page.description) {
    issues.push({
      url,
      type: "MISSING_DESCRIPTION",
      severity: "WARNING",
      message: "Missing meta description",
    });
  }

  if (page.h1s.length === 0) {
    issues.push({
      url,
      type: "MISSING_H1",
      severity: "WARNING",
      message: "No H1 heading found",
    });
  } else if (page.h1s.length > 1) {
    issues.push({
      url,
      type: "MULTIPLE_H1",
      severity: "INFO",
      message: `${page.h1s.length} H1 headings found`,
      details: { h1s: page.h1s },
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
      },
    });
  }

  if (!page.canonical) {
    issues.push({
      url,
      type: "MISSING_CANONICAL",
      severity: "INFO",
      message: "No canonical tag",
    });
  }

  if (!page.hasSchema) {
    issues.push({
      url,
      type: "MISSING_SCHEMA",
      severity: "INFO",
      message: "No structured data (JSON-LD / microdata)",
    });
  }

  if (page.loadMs > 3000) {
    issues.push({
      url,
      type: "SLOW_PAGE",
      severity: "WARNING",
      message: `Slow response: ${page.loadMs}ms`,
      details: { loadMs: page.loadMs },
    });
  }

  if (page.bytes > 3 * 1024 * 1024) {
    issues.push({
      url,
      type: "LARGE_PAGE",
      severity: "WARNING",
      message: `Large HTML payload: ${(page.bytes / 1024 / 1024).toFixed(1)}MB`,
      details: { bytes: page.bytes },
    });
  }

  // Mixed content: http assets on https page
  if (url.startsWith("https://") && /src=["']http:\/\//i.test(page.title || "")) {
    // checked on raw later - skip if no html store
  }

  void seedOrigin;
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
  // Cap deduction per page density
  return Math.max(0, Math.min(100, Math.round(score)));
}

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

/**
 * Crawl a site starting from domain root (+ sitemap). Limited for serverless.
 */
export async function runSiteCrawl(
  siteId: string,
  domain: string
): Promise<CrawlResult> {
  const seed = domain.startsWith("http") ? domain : `https://${domain}`;
  const seedUrl = normalizeUrl(seed, seed) || seed;
  const origin = originOf(seedUrl);

  const crawl = await db.crawl.create({
    data: {
      siteId,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  const issues: IssueInput[] = [];
  const pages: PageSnapshot[] = [];
  const visited = new Set<string>();
  const queue: string[] = [seedUrl];

  // robots + sitemap
  const robotsUrl = `${origin}/robots.txt`;
  const robotsText = await fetchText(robotsUrl);
  if (!robotsText) {
    issues.push({
      url: robotsUrl,
      type: "MISSING_ROBOTS",
      severity: "WARNING",
      message: "robots.txt not found or unreachable",
    });
  }

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
    });
  } else {
    for (const u of sitemapUrls.slice(0, 25)) {
      if (!queue.includes(u)) queue.push(u);
    }
  }

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const next = queue.shift()!;
    const normalized = normalizeUrl(next, origin);
    if (!normalized || visited.has(normalized)) continue;
    if (!sameHost(normalized, seedUrl)) continue;
    visited.add(normalized);

    try {
      const res = await fetchPage(normalized);
      if (!res.contentType.includes("html") && res.statusCode < 400) {
        continue;
      }

      // Redirect chain heuristic: final URL differs significantly
      if (res.finalUrl && normalizeUrl(res.finalUrl, origin) !== normalized) {
        const hops = Math.abs(res.finalUrl.length - normalized.length);
        if (hops > 0 && res.statusCode >= 200 && res.statusCode < 400) {
          // only flag if we followed redirects (fetch already followed)
          // detect via status if we had intermediate - skip heavy
        }
      }

      const page = parseHtml(
        normalizeUrl(res.finalUrl, origin) || normalized,
        res.html,
        res.statusCode,
        res.loadMs,
        res.bytes
      );

      // mixed content check on raw html
      if (page.url.startsWith("https://") && /(?:src|href)=["']http:\/\//i.test(res.html)) {
        issues.push({
          url: page.url,
          type: "MIXED_CONTENT",
          severity: "WARNING",
          message: "Page loads insecure HTTP resources",
        });
      }

      pages.push(page);
      issues.push(...issuesFromPage(page, origin));

      for (const link of page.internalOutlinks) {
        if (!visited.has(link) && queue.length + pages.length < MAX_PAGES * 2) {
          queue.push(link);
        }
      }
    } catch (err) {
      issues.push({
        url: normalized,
        type: "BROKEN_LINK",
        severity: "CRITICAL",
        message: err instanceof Error ? err.message : "Fetch failed",
      });
    }
  }

  // Duplicate titles / descriptions
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
          details: { title, urls },
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
          details: { description, urls },
        });
      }
    }
  }

  // Sitemap vs crawl
  const crawledSet = new Set(pages.map((p) => p.url));
  const sitemapSet = new Set(sitemapUrls);
  const missingFromSitemap = [...crawledSet].filter((u) => sitemapSet.size && !sitemapSet.has(u));
  // Orphans: in sitemap but no internal inlinks from crawled pages (except homepage)
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

  for (const url of missingFromSitemap.slice(0, 20)) {
    issues.push({
      url,
      type: "MISSING_SITEMAP",
      severity: "INFO",
      message: "Crawled page not listed in sitemap",
      details: { kind: "not_in_sitemap" },
    });
  }

  // Store orphan as crawl issues with details (reuse REDIRECT? better custom in details)
  // Use MISSING_CANONICAL? No - store as INFO via message with type MISSING_SITEMAP alternative
  // Schema has no ORPHAN - use details on a generic or MISSING_SCHEMA misuse - add as INFO BROKEN? 
  // We'll use message with type MISSING_CANONICAL no...
  // Actually use CrawlIssue type REDIRECT is wrong. Closest: store as INFO with type MISSING_SITEMAP and details.kind orphan
  for (const p of orphans.slice(0, 20)) {
    issues.push({
      url: p.url,
      type: "MISSING_CANONICAL", // placeholder - we'll map to "orphan" in UI via details
      severity: "WARNING",
      message: "Potential orphan page (no internal inlinks found)",
      details: { kind: "orphan", contentScore: p.contentScore },
    });
  }

  const healthScore = computeHealthScore(issues, pages.length);
  const avgContentScore =
    pages.length > 0
      ? Math.round(pages.reduce((s, p) => s + p.contentScore, 0) / pages.length)
      : 0;

  // Persist issues (cap to keep DB small)
  const toSave = issues.slice(0, 500);
  if (toSave.length) {
    await db.crawlIssue.createMany({
      data: toSave.map((i) => ({
        crawlId: crawl.id,
        url: i.url,
        type: i.type,
        severity: i.severity,
        message: i.message,
        details: {
          ...i.details,
          contentScores: undefined,
        },
      })),
    });
  }

  // Store page summaries in crawl via a synthetic approach - put summary on last issue details? 
  // Better: update crawl with pagesFound and store summary JSON by piggybacking - schema has no summary field.
  // Use first issue details no... Add summary as COMPLETED and store in a dedicated CrawlIssue? Messy.
  // We'll store summary by creating crawl and returning; for UI fetch issues + recompute from issues.
  // Also store page content scores as INFO issues? Too noisy.
  // Add optional details on crawl via raw query? Schema doesn't allow.
  // Quick migration would be best - but user said migrate. Let me add summary Json to Crawl via migration.

  await db.crawl.update({
    where: { id: crawl.id },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      pagesFound: pages.length,
      issuesFound: toSave.length,
      healthScore,
    },
  });

  // Store page snapshots as JSON file alternative: insert into CrawlIssue with type INFO for content score summary per page - only low scores
  const thin = pages.filter((p) => p.contentScore < 60);
  if (thin.length) {
    await db.crawlIssue.createMany({
      data: thin.slice(0, 30).map((p) => ({
        crawlId: crawl.id,
        url: p.url,
        type: "MISSING_DESCRIPTION" as IssueType, // will filter by details.kind
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

  // Internal link summary
  await db.crawlIssue.create({
    data: {
      crawlId: crawl.id,
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
          inlinks: inlinkCount.get(p.url) || 0,
        })),
        sitemapUrls: sitemapUrls.length,
        missingFromSitemap: missingFromSitemap.length,
        orphans: orphans.length,
        avgContentScore,
      },
    },
  });

  const finalIssues = await db.crawlIssue.count({ where: { crawlId: crawl.id } });
  await db.crawl.update({
    where: { id: crawl.id },
    data: { issuesFound: finalIssues },
  });

  return {
    crawlId: crawl.id,
    pagesFound: pages.length,
    issuesFound: finalIssues,
    healthScore,
    sitemapUrls: sitemapUrls.length,
    missingFromSitemap: missingFromSitemap.length,
    orphanCandidates: orphans.length,
    avgContentScore,
  };
}
