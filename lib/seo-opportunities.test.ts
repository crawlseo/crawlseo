import { describe, expect, it, vi } from "vitest";

const { getTopKeywords, getTopPages } = vi.hoisted(() => ({
  getTopKeywords: vi.fn(),
  getTopPages: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/seo-metrics", () => ({ getTopKeywords, getTopPages }));

import { csvTextCell, exportKeywordsCsv, exportPagesCsv } from "./seo-opportunities";

const metrics = { position: 4, clicks: 1, impressions: 10, ctr: 0.1 };

describe("csvTextCell", () => {
  it("prefixes an apostrophe to every formula trigger", () => {
    for (const trigger of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvTextCell(`${trigger}1+1`)).toBe(`"'${trigger}1+1"`);
    }
  });

  it("leaves ordinary text alone and still doubles quotes", () => {
    expect(csvTextCell("blue widgets")).toBe('"blue widgets"');
    expect(csvTextCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvTextCell("a-b = c")).toBe('"a-b = c"');
  });
});

describe("CSV exports", () => {
  it("writes a formula-shaped query as text", async () => {
    getTopKeywords.mockResolvedValue([
      { query: '=HYPERLINK("https://example.com","click")', ...metrics },
      { query: "@widgets", ...metrics },
    ]);

    const [, first, second] = (await exportKeywordsCsv("site-1")).split("\n");
    expect(first.startsWith(`"'=HYPERLINK(""https://example.com"",""click"")",`)).toBe(true);
    expect(second.startsWith(`"'@widgets",`)).toBe(true);
  });

  it("writes a formula-shaped URL as text", async () => {
    getTopPages.mockResolvedValue([{ url: "-1+1", ...metrics }]);

    const [, line] = (await exportPagesCsv("site-1")).split("\n");
    expect(line.startsWith(`"'-1+1",`)).toBe(true);
  });
});
