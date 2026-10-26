import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The alerts-evaluate job evaluates one site's alerts. Real Prisma client on PGlite.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { ensureDefaultAlerts, evaluateAlertsForUser } from "./evaluate";

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  for (const id of ["s1", "s2"]) {
    await db.site.create({ data: { id, userId: "u1", domain: `${id}.example` } });
    // A poor crawl on both sites: their CRAWL_ISSUES alerts fire.
    await db.crawl.create({ data: { siteId: id, status: "COMPLETED", healthScore: 40, finishedAt: new Date() } });
    await db.alert.create({ data: { userId: "u1", siteId: id, type: "CRAWL_ISSUES", channel: "EMAIL", config: {} } });
  }
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe("evaluateAlertsForUser", () => {
  it("evaluates only the given site's alerts", async () => {
    const fires = await evaluateAlertsForUser("u1", { siteId: "s1" });
    expect(fires.map((f) => f.siteId)).toEqual(["s1"]);
    const fired = await db.alert.findMany({ where: { lastFired: { not: null } }, select: { siteId: true } });
    expect(fired).toEqual([{ siteId: "s1" }]);
  });

  it("evaluates every site of the user without a site", async () => {
    const fires = await evaluateAlertsForUser("u1");
    expect(fires.map((f) => f.siteId).sort()).toEqual(["s1", "s2"]);
  });
});

describe("NOINDEX_SITEWIDE", () => {
  async function siteWithCrawl(id: string, pages: { statusCode: number; indexable: boolean }[]) {
    await db.site.create({ data: { id, userId: "u1", domain: `${id}.example` } });
    const crawl = await db.crawl.create({ data: { siteId: id, status: "COMPLETED", healthScore: 100, finishedAt: new Date() } });
    await db.auditPage.createMany({
      data: pages.map((p, i) => ({ crawlId: crawl.id, url: `https://${id}.example/${i}`, ...p })),
    });
    await db.alert.create({ data: { userId: "u1", siteId: id, type: "NOINDEX_SITEWIDE", channel: "EMAIL", config: {} } });
  }
  const pages = (noindex: number, indexable: number) => [
    ...Array.from({ length: noindex }, () => ({ statusCode: 200, indexable: false })),
    ...Array.from({ length: indexable }, () => ({ statusCode: 200, indexable: true })),
  ];

  it("fires when at least 80% of the fetched pages are noindex", async () => {
    await siteWithCrawl("n80", [...pages(8, 2), { statusCode: 404, indexable: true }]);
    const fires = await evaluateAlertsForUser("u1", { siteId: "n80" });
    expect(fires).toEqual([
      expect.objectContaining({
        type: "NOINDEX_SITEWIDE",
        message: "Most pages are noindex on n80.example: 8 of 10 pages are noindex. If that is not intended, search engines will drop them.",
      }),
    ]);
  });

  it("stays quiet below 80% and without fetched pages", async () => {
    await siteWithCrawl("n79", pages(79, 21));
    await siteWithCrawl("n0", [{ statusCode: 500, indexable: false }]);
    expect(await evaluateAlertsForUser("u1", { siteId: "n79" })).toEqual([]);
    expect(await evaluateAlertsForUser("u1", { siteId: "n0" })).toEqual([]);
  });

  it("fires once when a site has the same alert twice", async () => {
    await siteWithCrawl("ndup", pages(5, 0));
    await db.alert.create({ data: { userId: "u1", siteId: "ndup", type: "NOINDEX_SITEWIDE", channel: "EMAIL", config: {} } });
    expect(await evaluateAlertsForUser("u1", { siteId: "ndup" })).toHaveLength(1);
  });

  it("does not fire when the user turned it off", async () => {
    await siteWithCrawl("noff", pages(5, 0));
    await db.alert.updateMany({ where: { siteId: "noff" }, data: { enabled: false } });
    expect(await evaluateAlertsForUser("u1", { siteId: "noff" })).toEqual([]);
  });
});

describe("ensureDefaultAlerts", () => {
  it("gives a new site every default alert, the noindex one included", async () => {
    await db.site.create({ data: { id: "fresh", userId: "u1", domain: "fresh.example" } });
    await ensureDefaultAlerts("u1", "fresh");
    const types = (await db.alert.findMany({ where: { siteId: "fresh" }, select: { type: true } })).map((a) => a.type);
    expect(types.sort()).toEqual(["CRAWL_ISSUES", "NOINDEX_SITEWIDE", "POSITION_CHANGE", "TRAFFIC_DROP", "VITALS_DEGRADED"]);
  });

  it("adds only the new type to a site that has alerts, and keeps one turned off off", async () => {
    // s1 has a CRAWL_ISSUES alert from the setup; turn it off.
    await db.alert.updateMany({ where: { siteId: "s1" }, data: { enabled: false } });
    await ensureDefaultAlerts("u1", "s1", { newTypesOnly: true });
    await ensureDefaultAlerts("u1", "s1", { newTypesOnly: true });
    const rows = await db.alert.findMany({ where: { siteId: "s1" }, select: { type: true, enabled: true } });
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.type === "CRAWL_ISSUES")?.enabled).toBe(false);
    expect(rows.find((r) => r.type === "NOINDEX_SITEWIDE")?.enabled).toBe(true);
  });

  it("with newTypesOnly, gives a site without alerts none", async () => {
    await db.site.create({ data: { id: "bare", userId: "u1", domain: "bare.example" } });
    await ensureDefaultAlerts("u1", "bare", { newTypesOnly: true });
    expect(await db.alert.count({ where: { siteId: "bare" } })).toBe(0);
  });
});
