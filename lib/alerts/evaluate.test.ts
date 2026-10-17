import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The alerts-evaluate job evaluates one site's alerts. Real Prisma client on PGlite.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { evaluateAlertsForUser } from "./evaluate";

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
