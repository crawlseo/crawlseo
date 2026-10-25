import { describe, expect, it } from "vitest";
import { headerSaysNoindex, metaSaysNoindex, noindexSources } from "./noindex";
import { issuesFromPage, parseHtml } from "./engine";

// #105: noindex pages are crawled but kept out of the audit. These cover every
// way a page can be told noindex, and the ways it only looks like it.

/** parseHtml on a page with `head` in its <head> and an optional X-Robots-Tag. */
function parse(head: string, xRobotsTag: string | null = null) {
  const html = `<html><head>${head}</head><body><h1>Hi</h1></body></html>`;
  return parseHtml("https://example.com/p", html, 200, 100, html.length, null, "https://example.com/", xRobotsTag);
}

describe("metaSaysNoindex", () => {
  it.each([
    ["robots", "noindex"],
    ["robots", "noindex, follow"],
    ["robots", "follow,noindex"],
    ["robots", "  NOINDEX ,  nofollow "],
    ["ROBOTS", "noindex"],
    ["robots", "none"],
    ["robots", "None"],
    ["googlebot", "noindex"],
    ["GoogleBot", "noarchive, noindex"],
    ["googlebot", "none"],
  ])("<meta name=%j content=%j> is noindex", (name, content) => {
    expect(metaSaysNoindex([[name, content]])).toBe(true);
  });

  it.each([
    ["robots", "index, follow"],
    ["robots", "nofollow"],
    ["robots", "noarchive, nosnippet"],
    ["robots", "noindexer"],
    ["robots", "max-snippet:-1, max-image-preview:large"],
    ["robots", ""],
    ["bingbot", "noindex"],
    ["googlebot-news", "noindex"],
    ["description", "noindex"],
  ])("<meta name=%j content=%j> is not noindex", (name, content) => {
    expect(metaSaysNoindex([[name, content]])).toBe(false);
  });

  it("counts every robots tag: a later noindex wins over an earlier index", () => {
    expect(metaSaysNoindex([["robots", "index, follow"], ["robots", "noindex"]])).toBe(true);
    expect(metaSaysNoindex([["robots", "index"], ["googlebot", "noindex"]])).toBe(true);
    expect(metaSaysNoindex([["googlebot", "index"], ["robots", "noindex"]])).toBe(true);
  });
});

describe("headerSaysNoindex", () => {
  it.each([
    "noindex",
    "NoIndex",
    "none",
    "noindex, nofollow",
    "nofollow,noindex",
    "googlebot: noindex",
    "GoogleBot: NOINDEX",
    "googlebot:noindex",
    "googlebot: nofollow, noindex",
    "googlebot: none",
    "bingbot: noarchive, googlebot: noindex",
    "unavailable_after: 25 Jun 2010 15:00:00 PST, noindex",
    "max-snippet: 20, noindex",
  ])("X-Robots-Tag: %s is noindex", (value) => {
    expect(headerSaysNoindex([value])).toBe(true);
  });

  it.each([
    "index, follow",
    "nofollow",
    "noarchive",
    "all",
    "bingbot: noindex",
    "otherbot: noindex, nofollow",
    "googlebot-news: noindex",
    "googlebot: nofollow, bingbot: noindex",
    "unavailable_after: Sunday, 01-Sep-24 15:00:00 GMT",
    "max-snippet: 20, max-image-preview: large",
    "",
  ])("X-Robots-Tag: %s is not noindex", (value) => {
    expect(headerSaysNoindex([value])).toBe(false);
  });

  it("reads multiple header lines separately", () => {
    expect(headerSaysNoindex(["bingbot: noindex", "noindex"])).toBe(true);
    expect(headerSaysNoindex(["bingbot: noindex", "googlebot: noindex"])).toBe(true);
    expect(headerSaysNoindex(["bingbot: noindex", "nofollow"])).toBe(false);
    expect(headerSaysNoindex(["otherbot: noindex", "googlebot: nofollow"])).toBe(false);
  });

  it("is false with no header", () => {
    expect(headerSaysNoindex([])).toBe(false);
  });
});

describe("noindexSources", () => {
  it("lists each source that says noindex", () => {
    expect(noindexSources([["robots", "noindex"]], [])).toEqual(["meta"]);
    expect(noindexSources([], ["noindex"])).toEqual(["x-robots-tag"]);
    expect(noindexSources([["robots", "noindex"]], ["googlebot: noindex"])).toEqual(["meta", "x-robots-tag"]);
    expect(noindexSources([["robots", "index"]], ["nofollow"])).toEqual([]);
  });
});

describe("parseHtml noindex", () => {
  it("is indexable without any robots directive", () => {
    const p = parse("<title>Page</title>");
    expect(p.indexable).toBe(true);
    expect(p.noindexSource).toBeNull();
    expect(p.xRobotsTag).toBeNull();
  });

  it("reads meta robots noindex", () => {
    const p = parse('<meta name="robots" content="noindex, follow">');
    expect(p.indexable).toBe(false);
    expect(p.noindexSource).toBe("meta");
  });

  it("reads meta robots none, unquoted and upper case", () => {
    const p = parse("<META NAME=ROBOTS CONTENT=NONE>");
    expect(p.indexable).toBe(false);
  });

  it("reads meta googlebot noindex", () => {
    const p = parse('<meta name="googlebot" content="noindex">');
    expect(p.indexable).toBe(false);
    expect(p.noindexSource).toBe("meta");
  });

  it("ignores a meta noindex for another crawler", () => {
    expect(parse('<meta name="bingbot" content="noindex">').indexable).toBe(true);
  });

  it("finds a noindex robots tag after an index one", () => {
    expect(parse('<meta name="robots" content="index"><meta name="robots" content="noindex">').indexable).toBe(false);
  });

  it("does not take noindex from text that only contains it", () => {
    expect(parse('<meta name="robots" content="noindexer">').indexable).toBe(true);
    expect(parse('<meta name="description" content="noindex">').indexable).toBe(true);
  });

  it("reads the X-Robots-Tag header", () => {
    const p = parse("<title>Page</title>", "noindex");
    expect(p.indexable).toBe(false);
    expect(p.noindexSource).toBe("x-robots-tag");
    expect(p.xRobotsTag).toBe("noindex");
  });

  it("reads a googlebot-scoped header and ignores one for another crawler", () => {
    expect(parse("", "googlebot: noindex").indexable).toBe(false);
    expect(parse("", "bingbot: noindex").indexable).toBe(true);
  });

  it("reads two headers as fetch() joins them", () => {
    // Headers.get() returns repeated headers joined with ", ".
    expect(parse("", "noarchive, googlebot: noindex").indexable).toBe(false);
    expect(parse("", "googlebot: nofollow, bingbot: noindex").indexable).toBe(true);
  });

  it("header noindex wins over meta index", () => {
    const p = parse('<meta name="robots" content="index, follow">', "noindex");
    expect(p.indexable).toBe(false);
    expect(p.noindexSource).toBe("x-robots-tag");
  });

  it("meta noindex wins over a header that allows indexing", () => {
    const p = parse('<meta name="robots" content="noindex">', "index, follow");
    expect(p.indexable).toBe(false);
    expect(p.noindexSource).toBe("meta");
  });

  it("names both sources when both say noindex", () => {
    expect(parse('<meta name="robots" content="noindex">', "noindex").noindexSource).toBe("meta, x-robots-tag");
  });

  it("still collects the links of a noindex page", () => {
    const html =
      '<html><head><meta name="robots" content="noindex, follow"></head><body><a href="/next">n</a></body></html>';
    const p = parseHtml("https://example.com/p", html, 200, 100, html.length, null, "https://example.com/");
    expect(p.indexable).toBe(false);
    expect(p.internalOutlinks).toEqual(["https://example.com/next"]);
  });
});

describe("issuesFromPage on a noindex page", () => {
  it("raises no on-page issues", () => {
    // No title, description, H1, canonical or schema: five issues if indexable.
    const html = '<html><head><meta name="robots" content="noindex"></head><body></body></html>';
    const p = parseHtml("https://example.com/p", html, 200, 100, html.length, null, "https://example.com/");
    expect(issuesFromPage(p, "https://example.com")).toEqual([]);
    expect(issuesFromPage({ ...p, indexable: true }, "https://example.com").length).toBeGreaterThan(0);
  });

  it("still reports a broken page that carries noindex", () => {
    const html = '<html><head><meta name="robots" content="noindex"></head><body>Not found</body></html>';
    const p = parseHtml("https://example.com/gone", html, 404, 100, html.length, null, "https://example.com/");
    expect(p.indexable).toBe(false);
    expect(issuesFromPage(p, "https://example.com").map((i) => i.type)).toEqual(["BROKEN_LINK"]);
  });
});
