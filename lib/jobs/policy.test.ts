import { describe, expect, it } from "vitest";
import {
  canStartCrawl,
  clampMaxPages,
  crawlPageCeiling,
  DEFAULT_CRAWL_PAGE_CEILING,
  DEFAULT_CRAWL_PAGES,
} from "./policy";

describe("crawlPageCeiling", () => {
  it("defaults to 2000", () => {
    expect(DEFAULT_CRAWL_PAGE_CEILING).toBe(2000);
    expect(crawlPageCeiling({})).toBe(2000);
    expect(crawlPageCeiling({ CRAWL_MAX_PAGES: "" })).toBe(2000);
    expect(crawlPageCeiling({ CRAWL_MAX_PAGES: "  " })).toBe(2000);
  });

  it("reads CRAWL_MAX_PAGES as a whole number", () => {
    expect(crawlPageCeiling({ CRAWL_MAX_PAGES: "500" })).toBe(500);
    expect(crawlPageCeiling({ CRAWL_MAX_PAGES: " 750 " })).toBe(750);
    expect(crawlPageCeiling({ CRAWL_MAX_PAGES: "10000" })).toBe(10000);
    expect(crawlPageCeiling({ CRAWL_MAX_PAGES: "99.9" })).toBe(99);
  });

  it("falls back to the default for values that are not a positive number", () => {
    for (const v of ["0", "-5", "abc", "NaN", "Infinity", "0.5"]) {
      expect(crawlPageCeiling({ CRAWL_MAX_PAGES: v })).toBe(DEFAULT_CRAWL_PAGE_CEILING);
    }
  });
});

describe("clampMaxPages", () => {
  it("keeps a request within the ceiling", () => {
    expect(clampMaxPages(50, 2000)).toBe(50);
    expect(clampMaxPages(2000, 2000)).toBe(2000);
    expect(clampMaxPages(999_999, 2000)).toBe(2000);
    expect(clampMaxPages(300, 100)).toBe(100);
  });

  it("uses the default for a missing or invalid request", () => {
    for (const v of [undefined, null, 0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "500", {}]) {
      expect(clampMaxPages(v, 2000)).toBe(DEFAULT_CRAWL_PAGES);
    }
  });

  it("clamps the default too when the ceiling is below it", () => {
    expect(clampMaxPages(undefined, 50)).toBe(50);
  });

  it("rounds a fractional request down", () => {
    expect(clampMaxPages(25.9, 2000)).toBe(25);
  });

  it("reads the ceiling from the environment by default", () => {
    const before = process.env.CRAWL_MAX_PAGES;
    process.env.CRAWL_MAX_PAGES = "30";
    try {
      expect(clampMaxPages(100)).toBe(30);
    } finally {
      if (before === undefined) delete process.env.CRAWL_MAX_PAGES;
      else process.env.CRAWL_MAX_PAGES = before;
    }
  });
});

describe("canStartCrawl", () => {
  it("allows every crawl by default", async () => {
    await expect(
      canStartCrawl({ id: "s1", userId: "u1" }, { source: "manual", maxPages: 200 })
    ).resolves.toEqual({ ok: true });
  });
});
