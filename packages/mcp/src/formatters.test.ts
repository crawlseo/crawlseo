import { describe, expect, it } from "vitest";
import { formatCrawlIssues } from "./formatters";

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
