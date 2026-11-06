import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDataLagDate, getDateDaysAgo, getDateRange } from "./date-utils";

const originalTz = process.env.TZ;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const datesIn = ({ start, end }: { start: string; end: string }) =>
  (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;

describe("getDateRange", () => {
  it("ends at the newest date GSC has", () => {
    vi.setSystemTime(new Date("2026-03-20T12:00:00Z"));
    expect(getDateRange(7).end).toBe("2026-03-17");
    expect(getDateRange(7).end).toBe(getDataLagDate());
  });

  it("spans exactly the requested number of dates", () => {
    vi.setSystemTime(new Date("2026-03-20T12:00:00Z"));
    expect(getDateRange(7)).toEqual({ start: "2026-03-11", end: "2026-03-17" });
    expect(datesIn(getDateRange(7))).toBe(7);
    expect(datesIn(getDateRange(28))).toBe(28);
  });
});

describe("getDateDaysAgo", () => {
  it("counts whole UTC days across a clock change", () => {
    process.env.TZ = "Europe/London";
    vi.setSystemTime(new Date("2026-11-06T00:30:00Z"));
    expect(getDateDaysAgo(28)).toBe("2026-10-09");
  });

  it("gives the same date whatever the server's time zone", () => {
    vi.setSystemTime(new Date("2026-03-20T01:30:00Z"));
    for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      expect(getDateDaysAgo(3)).toBe("2026-03-17");
    }
  });
});
