import { describe, expect, it } from "vitest";
import { formatCrawlIssues, formatUrlInspection } from "./formatters";

const crawl = {
  id: "c1",
  status: "COMPLETED",
  startedAt: "2026-10-25T10:00:00.000Z",
  finishedAt: "2026-10-25T10:05:00.000Z",
  pagesFound: 12,
  issuesFound: 0,
  healthScore: 100,
  error: null,
};

describe("formatCrawlIssues noindex line (#105)", () => {
  it("says how many noindex pages were kept out of the score", () => {
    const out = formatCrawlIssues({ crawl, total: 0, bySeverity: {}, noindexPages: 3, issues: [] });
    expect(out).toContain("3 noindex pages crawled but not scored");
  });

  it("says nothing when there were none, or the instance predates the count", () => {
    expect(formatCrawlIssues({ crawl, total: 0, bySeverity: {}, noindexPages: 0, issues: [] })).not.toContain("noindex");
    expect(formatCrawlIssues({ crawl, total: 0, bySeverity: {}, issues: [] })).not.toContain("noindex");
  });
});

describe("formatCrawlIssues site-wide noindex warning (#106)", () => {
  const message = "9 of 10 pages are noindex. If that is not intended, search engines will drop them.";

  it("prints the warning above the counts when the instance sends one", () => {
    const out = formatCrawlIssues({ crawl, total: 0, bySeverity: {}, noindexPages: 9, noindexWarning: { message }, issues: [] });
    expect(out).toContain(`WARNING: ${message}`);
    expect(out.indexOf("WARNING")).toBeLessThan(out.indexOf("9 noindex pages crawled"));
  });

  it("prints nothing for null or an instance without the field", () => {
    expect(formatCrawlIssues({ crawl, total: 0, bySeverity: {}, noindexPages: 1, noindexWarning: null, issues: [] })).not.toContain("WARNING");
    expect(formatCrawlIssues({ crawl, total: 0, bySeverity: {}, noindexPages: 1, issues: [] })).not.toContain("WARNING");
  });
});

describe("formatUrlInspection", () => {
  const indexed = {
    url: "https://example.com/post",
    inspectionResultLink: "https://search.google.com/search-console/inspect?id=1",
    verdict: "PASS",
    coverageState: "Submitted and indexed",
    robotsTxtState: "ALLOWED",
    indexingState: "INDEXING_ALLOWED",
    lastCrawlTime: "2026-11-01T08:30:12Z",
    pageFetchState: "SUCCESSFUL",
    crawledAs: "MOBILE",
    googleCanonical: "https://example.com/post",
    userCanonical: "https://example.com/post",
    sitemap: ["https://example.com/sitemap.xml"],
    referringUrls: ["https://example.com/", "https://example.com/a", "https://example.com/b", "https://example.com/c"],
  };

  it("shows verdict, last crawl in UTC, fetch and robots state, counts with the first few URLs and the link", () => {
    const out = formatUrlInspection(indexed);
    expect(out).toContain("Verdict: PASS  |  Coverage: Submitted and indexed");
    expect(out).toContain("Last crawl: 2026-11-01 08:30 UTC  |  Crawled as: MOBILE");
    expect(out).toContain("Page fetch: SUCCESSFUL  |  robots.txt: ALLOWED  |  Indexing: INDEXING_ALLOWED");
    expect(out).toContain("Sitemaps (1): https://example.com/sitemap.xml");
    expect(out).toContain("Referring URLs (4): https://example.com/, https://example.com/a, https://example.com/b, ...");
    expect(out).not.toContain("example.com/c");
    expect(out).toContain("Search Console: https://search.google.com/search-console/inspect?id=1");
    expect(out).not.toContain("WARNING");
  });

  it("flags a canonical mismatch", () => {
    const out = formatUrlInspection({ ...indexed, googleCanonical: "https://example.com/other" });
    expect(out).toContain("WARNING: Google chose a different canonical");
  });

  it("reads a never-crawled URL without inventing values", () => {
    const out = formatUrlInspection({
      ...indexed,
      inspectionResultLink: null,
      verdict: "NEUTRAL",
      coverageState: "URL is unknown to Google",
      lastCrawlTime: null,
      crawledAs: null,
      googleCanonical: null,
      userCanonical: null,
      sitemap: [],
      referringUrls: [],
    });
    expect(out).toContain("Last crawl: never  |  Crawled as: -");
    expect(out).toContain("Sitemaps: none");
    expect(out).not.toContain("WARNING");
    expect(out).not.toContain("Search Console:");
  });
});
