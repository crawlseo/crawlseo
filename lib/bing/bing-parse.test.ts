import { describe, it, expect } from "vitest";
import {
  aggregateWeekly,
  collapseWeeks,
  normalisePosition,
  parseBingDate,
} from "./bing-parse";

describe("parseBingDate", () => {
  // Samples taken from live GetQueryStats/GetCrawlStats responses.
  it("keeps the day Bing means across both DST offsets", () => {
    expect(parseBingDate("/Date(1747983600000-0700)/")).toBe("2025-05-23");
    expect(parseBingDate("/Date(1772179200000-0800)/")).toBe("2026-02-27");
  });

  it("lands on Friday, the day Bing closes a weekly bucket", () => {
    const day = new Date(`${parseBingDate("/Date(1786690800000-0700)/")}T00:00:00Z`);
    expect(day.getUTCDay()).toBe(5);
  });

  it("rejects anything it cannot read instead of inventing a date", () => {
    expect(() => parseBingDate("2026-08-21")).toThrow();
  });
});

describe("normalisePosition", () => {
  it("treats -1 as the no-clicks sentinel, not as a rank", () => {
    expect(normalisePosition(-1)).toBeNull();
    expect(normalisePosition(0)).toBeNull();
    expect(normalisePosition(4)).toBe(4);
  });
});

describe("aggregateWeekly", () => {
  it("sums repeats of one key inside a bucket instead of overwriting them", () => {
    const rows = aggregateWeekly([
      {
        Query: "blue widgets",
        Date: "/Date(1747983600000-0700)/",
        Clicks: 1,
        Impressions: 10,
        AvgImpressionPosition: 2,
      },
      {
        Query: "blue widgets",
        Date: "/Date(1747983600000-0700)/",
        Clicks: 2,
        Impressions: 30,
        AvgImpressionPosition: 6,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].clicks).toBe(3);
    expect(rows[0].impressions).toBe(40);
    // Impression-weighted: (2*10 + 6*30) / 40 = 5
    expect(rows[0].avgImpressionPosition).toBe(5);
  });

  it("keeps separate weeks separate", () => {
    const rows = aggregateWeekly([
      {
        Query: "widget repair",
        Date: "/Date(1747983600000-0700)/",
        Clicks: 0,
        Impressions: 3,
        AvgImpressionPosition: 8,
      },
      {
        Query: "widget repair",
        Date: "/Date(1786690800000-0700)/",
        Clicks: 0,
        Impressions: 5,
        AvgImpressionPosition: 4,
      },
    ]);

    expect(rows).toHaveLength(2);
  });
});

describe("collapseWeeks", () => {
  it("adds volume across weeks and weights position by impressions", () => {
    const [row] = collapseWeeks([
      {
        key: "widget store near me",
        weekEnding: "2026-08-14",
        clicks: 1,
        impressions: 10,
        avgImpressionPosition: 1,
      },
      {
        key: "widget store near me",
        weekEnding: "2026-08-21",
        clicks: 3,
        impressions: 30,
        avgImpressionPosition: 5,
      },
    ]);

    expect(row.clicks).toBe(4);
    expect(row.impressions).toBe(40);
    expect(row.position).toBe(4); // (1*10 + 5*30) / 40
    expect(row.ctr).toBeCloseTo(0.1);
  });

  it("reports no position when every bucket was a sentinel", () => {
    const [row] = collapseWeeks([
      {
        key: "widgets",
        weekEnding: "2026-08-21",
        clicks: 0,
        impressions: 7,
        avgImpressionPosition: null,
      },
    ]);

    expect(row.position).toBeNull();
    expect(row.ctr).toBe(0);
  });
});
