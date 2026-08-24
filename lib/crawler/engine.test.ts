import { describe, it, expect } from "vitest";
import {
  matchManagedInfra,
  issuesFromPage,
  computeHealthScore,
  type PageSnapshot,
  type IssueInput,
} from "./engine";

/* ------------------------------------------------------------------ */
/*  Helper: build a minimal valid PageSnapshot, overriding fields      */
/* ------------------------------------------------------------------ */

function makePage(overrides: Partial<PageSnapshot> & { url: string }): PageSnapshot {
  return {
    statusCode: 200,
    redirectUrl: null,
    title: "Test Page",
    description: "A description",
    h1s: ["Hello"],
    canonical: "https://example.com/",
    robotsMeta: null,
    wordCount: 500,
    contentScore: 80,
    internalOutlinks: [],
    externalOutlinks: [],
    links: [],
    hasSchema: true,
    hreflangTags: [],
    imageCount: 0,
    imagesMissingAlt: 0,
    bytes: 10_000,
    loadMs: 200,
    contentHash: "abc123",
    indexable: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  matchManagedInfra                                                  */
/* ------------------------------------------------------------------ */

describe("matchManagedInfra", () => {
  it("matches /cdn-cgi/l/email-protection as Cloudflare", () => {
    const result = matchManagedInfra("https://example.com/cdn-cgi/l/email-protection");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("Cloudflare");
  });

  it("matches bare /cdn-cgi/ path as Cloudflare", () => {
    const result = matchManagedInfra("https://example.com/cdn-cgi/");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("Cloudflare");
  });

  it("does NOT match /blog/cdn-cgi-explained (substring, not prefix)", () => {
    expect(matchManagedInfra("https://example.com/blog/cdn-cgi-explained")).toBeNull();
  });

  it("does NOT match site root /", () => {
    expect(matchManagedInfra("https://example.com/")).toBeNull();
  });

  it("returns null for malformed / relative URLs without throwing", () => {
    expect(() => matchManagedInfra("not-a-url")).not.toThrow();
    expect(matchManagedInfra("not-a-url")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  issuesFromPage — severity classification                           */
/* ------------------------------------------------------------------ */

describe("issuesFromPage", () => {
  const origin = "https://example.com";

  it("flags a normal 404 as CRITICAL BROKEN_LINK", () => {
    const page = makePage({ url: "https://example.com/missing", statusCode: 404 });
    const issues = issuesFromPage(page, origin);
    const broken = issues.find((i) => i.type === "BROKEN_LINK");
    expect(broken).toBeDefined();
    expect(broken!.severity).toBe("CRITICAL");
    expect(broken!.message).toContain("404");
  });

  it("flags a 500 on a normal URL as CRITICAL", () => {
    const page = makePage({ url: "https://example.com/error", statusCode: 500 });
    const issues = issuesFromPage(page, origin);
    const broken = issues.find((i) => i.type === "BROKEN_LINK");
    expect(broken).toBeDefined();
    expect(broken!.severity).toBe("CRITICAL");
  });

  it("downgrades /cdn-cgi/ 403 to INFO, not CRITICAL", () => {
    const page = makePage({
      url: "https://example.com/cdn-cgi/l/email-protection",
      statusCode: 403,
    });
    const issues = issuesFromPage(page, origin);
    const broken = issues.find((i) => i.type === "BROKEN_LINK");
    expect(broken).toBeDefined();
    expect(broken!.severity).toBe("INFO");
    expect(broken!.message).toContain("Cloudflare");
  });

  it("includes provider name in managed infra message", () => {
    const page = makePage({
      url: "https://example.com/cdn-cgi/trace",
      statusCode: 404,
    });
    const issues = issuesFromPage(page, origin);
    const broken = issues.find((i) => i.type === "BROKEN_LINK");
    expect(broken!.message).toContain("Cloudflare");
  });

  it("raises no BROKEN_LINK for 200 status", () => {
    const page = makePage({ url: "https://example.com/ok", statusCode: 200 });
    const issues = issuesFromPage(page, origin);
    expect(issues.find((i) => i.type === "BROKEN_LINK")).toBeUndefined();
  });

  it("returns early on error status — no further checks", () => {
    const page = makePage({
      url: "https://example.com/gone",
      statusCode: 410,
      title: null,
      description: null,
      h1s: [],
    });
    const issues = issuesFromPage(page, origin);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("BROKEN_LINK");
  });

  it("flags missing title as CRITICAL", () => {
    const page = makePage({ url: "https://example.com/no-title", title: null });
    const issues = issuesFromPage(page, origin);
    const missing = issues.find((i) => i.type === "MISSING_TITLE");
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe("CRITICAL");
  });

  it("flags missing meta description as WARNING", () => {
    const page = makePage({ url: "https://example.com/no-desc", description: null });
    const issues = issuesFromPage(page, origin);
    const missing = issues.find((i) => i.type === "MISSING_DESCRIPTION");
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe("WARNING");
  });

  it("flags slow page (>3s) as WARNING", () => {
    const page = makePage({ url: "https://example.com/slow", loadMs: 5000 });
    const issues = issuesFromPage(page, origin);
    const slow = issues.find((i) => i.type === "SLOW_PAGE");
    expect(slow).toBeDefined();
    expect(slow!.severity).toBe("WARNING");
  });
});

/* ------------------------------------------------------------------ */
/*  computeHealthScore                                                 */
/* ------------------------------------------------------------------ */

function issue(severity: "CRITICAL" | "WARNING" | "INFO"): IssueInput {
  return { url: "https://x.com", type: "BROKEN_LINK", severity, message: "test" };
}

describe("computeHealthScore", () => {
  it("returns 100 for no issues", () => {
    expect(computeHealthScore([], 10)).toBe(100);
  });

  it("returns 0 for zero pages", () => {
    expect(computeHealthScore([], 0)).toBe(0);
  });

  it("deducts 8 points per CRITICAL issue", () => {
    expect(computeHealthScore([issue("CRITICAL")], 10)).toBe(92);
  });

  it("deducts 3 points per WARNING issue", () => {
    expect(computeHealthScore([issue("WARNING")], 10)).toBe(97);
  });

  it("deducts 1 point per INFO issue", () => {
    expect(computeHealthScore([issue("INFO")], 10)).toBe(99);
  });

  it("floors at 0, never goes negative", () => {
    const many = Array.from({ length: 20 }, () => issue("CRITICAL"));
    expect(computeHealthScore(many, 10)).toBe(0);
  });

  it("handles mixed severities", () => {
    const issues = [issue("CRITICAL"), issue("WARNING"), issue("INFO")];
    // 100 - 8 - 3 - 1 = 88
    expect(computeHealthScore(issues, 5)).toBe(88);
  });
});
