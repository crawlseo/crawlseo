import { afterAll, describe, expect, it } from "vitest";
import { gscDate } from "./gsc-date";

const originalTZ = process.env.TZ;

afterAll(() => {
  process.env.TZ = originalTZ;
});

describe.each(["Europe/Madrid", "America/New_York", "UTC"])("gscDate under TZ=%s", (tz) => {
  it("returns UTC midnight of the GSC day", () => {
    process.env.TZ = tz;

    expect(gscDate("2026-09-14").toISOString()).toBe("2026-09-14T00:00:00.000Z");
    // Winter date too, so both sides of DST are covered.
    expect(gscDate("2026-01-05").toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  it("differs from local midnight off UTC, so the TZ switch is really in effect", () => {
    process.env.TZ = tz;

    const localMidnight = new Date(2026, 8, 14).toISOString();
    if (tz === "UTC") {
      expect(localMidnight).toBe("2026-09-14T00:00:00.000Z");
    } else {
      // The old worker convention: 2026-09-13T22:00Z in Madrid, 04:00Z in New York.
      expect(localMidnight).not.toBe("2026-09-14T00:00:00.000Z");
    }
  });
});

describe("gscDate input validation", () => {
  it.each([
    "",
    "2026-9-14",
    "2026/09/14",
    "2026-09-14T00:00:00Z",
    " 2026-09-14",
    "2026-13-01",
    "2026-02-30",
    "2026-00-10",
    "not a date",
  ])("throws on %j", (input) => {
    expect(() => gscDate(input)).toThrow(/Invalid GSC date/);
  });

  it("accepts a leap day", () => {
    expect(gscDate("2028-02-29").toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
});
