import { describe, expect, it } from "vitest";
import { NOINDEX_WARNING_SHARE, noindexWarning } from "./noindex-warning";

// A crawl whose fetched (2xx) pages are all, or at least 80%, noindex scores
// 100 with no issues, since noindex pages are not scored. The warning says so.

describe("noindexWarning", () => {
  it("is quiet at 79%", () => {
    expect(noindexWarning(79, 100)).toBeNull();
  });

  it("warns at exactly 80%", () => {
    expect(NOINDEX_WARNING_SHARE).toBe(0.8);
    expect(noindexWarning(80, 100)).toEqual({
      noindexPages: 80,
      fetchedPages: 100,
      message: "80 of 100 pages are noindex. If that is not intended, search engines will drop them.",
    });
    expect(noindexWarning(4, 5)?.message).toBe("4 of 5 pages are noindex. If that is not intended, search engines will drop them.");
  });

  it("warns at 100%, a single page included", () => {
    expect(noindexWarning(100, 100)?.noindexPages).toBe(100);
    expect(noindexWarning(1, 1)?.message).toBe("1 of 1 pages are noindex. If that is not intended, search engines will drop them.");
  });

  it("is quiet without any fetched (2xx) page", () => {
    expect(noindexWarning(0, 0)).toBeNull();
  });

  it("is quiet when no page is noindex", () => {
    expect(noindexWarning(0, 10)).toBeNull();
  });
});
