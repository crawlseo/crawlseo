import { describe, it, expect } from "vitest";
import { aggregateByQueryAndDate } from "./aggregate";

const base = { date: "2026-08-20", ctr: 0, page: "https://a.com/x" };

describe("aggregateByQueryAndDate", () => {
  it("adds up the device and country slices of one query-day", () => {
    const [row] = aggregateByQueryAndDate([
      { ...base, query: "alpha", device: "MOBILE", country: "usa", clicks: 3, impressions: 30, position: 4 },
      { ...base, query: "alpha", device: "DESKTOP", country: "usa", clicks: 2, impressions: 10, position: 8 },
    ]);

    // Storing these unmerged would key both on (site, alpha, 2026-08-20) and
    // let the second overwrite the first, losing three clicks.
    expect(row.clicks).toBe(5);
    expect(row.impressions).toBe(40);
    expect(row.position).toBe(5); // (4*30 + 8*10) / 40
    expect(row.ctr).toBeCloseTo(0.125);
  });

  it("keeps different days and different queries apart", () => {
    const rows = aggregateByQueryAndDate([
      { ...base, query: "alpha", clicks: 1, impressions: 1, position: 1 },
      { ...base, query: "alpha", date: "2026-08-21", clicks: 1, impressions: 1, position: 1 },
      { ...base, query: "beta", clicks: 1, impressions: 1, position: 1 },
    ]);

    expect(rows).toHaveLength(3);
  });

  it("keeps the landing page that carried the most impressions", () => {
    const [row] = aggregateByQueryAndDate([
      { ...base, query: "alpha", page: "https://a.com/small", clicks: 0, impressions: 2, position: 9 },
      { ...base, query: "alpha", page: "https://a.com/big", clicks: 0, impressions: 40, position: 3 },
    ]);

    expect(row.page).toBe("https://a.com/big");
  });

  // Null, not undefined: Prisma reads undefined on an update as "leave this
  // column alone", which would strand yesterday-s single device on the row.
  it("only claims a device or country when the day had just one", () => {
    const [mixed] = aggregateByQueryAndDate([
      { ...base, query: "q", device: "MOBILE", country: "usa", clicks: 0, impressions: 1, position: 5 },
      { ...base, query: "q", device: "DESKTOP", country: "usa", clicks: 0, impressions: 1, position: 5 },
    ]);
    expect(mixed.device).toBeNull();
    expect(mixed.country).toBe("usa");
  });

  it("does not divide by zero when a slice had no impressions", () => {
    const [row] = aggregateByQueryAndDate([
      { ...base, query: "q", clicks: 0, impressions: 0, position: 12 },
    ]);
    expect(row.position).toBe(12);
    expect(row.ctr).toBe(0);
  });
});
