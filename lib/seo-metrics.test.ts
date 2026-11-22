import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Period comparisons on the real Prisma client (PGlite), with rows stored the
// way the GSC sync stores them: one per date, none newer than the lag boundary.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { getSitePeriodMetrics } from "./seo-metrics";
import { getContentDecay } from "./seo-opportunities";

const NOW = new Date("2026-03-20T12:00:00Z");
const NEWEST_GSC_DATE = Date.parse("2026-03-17T00:00:00Z");
const DAY = 86_400_000;

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  const user = await db.user.create({ data: { email: "owner@example.com" } });
  await db.site.create({ data: { id: "flat", userId: user.id, domain: "example.com" } });
  await db.page.createMany({
    data: Array.from({ length: 70 }, (_, i) => ({
      siteId: "flat",
      url: "https://example.com/a",
      date: new Date(NEWEST_GSC_DATE - i * DAY),
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      position: 5,
    })),
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
}, 120_000);

afterEach(() => {
  vi.setSystemTime(NOW);
});

afterAll(async () => {
  vi.useRealTimers();
  await t?.close();
});

describe("period comparisons", () => {
  it.each([7, 28])("shows no change on flat traffic over %i days", async (days) => {
    const { current, previous, deltas } = await getSitePeriodMetrics("flat", days);
    expect(current.clicks).toBe(10 * days);
    expect(previous.clicks).toBe(10 * days);
    expect(deltas.clicks).toBe(0);
    expect(deltas.impressions).toBe(0);
  });

  it("still shows traffic that really stopped", async () => {
    vi.setSystemTime(new Date(NOW.getTime() + 7 * DAY));
    const { current, previous, deltas } = await getSitePeriodMetrics("flat", 7);
    expect(current.clicks).toBe(0);
    expect(previous.clicks).toBe(70);
    expect(deltas.clicks).toBe(-100);
  });

  it("does not report flat traffic as content decay", async () => {
    expect(await getContentDecay("flat")).toEqual([]);
  });
});
