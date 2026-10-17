import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Adding a site queues its first GSC sync as a job. Real Prisma client on
// PGlite; auth, DNS and next/server's after() are stubbed.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const after = vi.hoisted(() => vi.fn());
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("next/server", () => ({ after }));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { SERVERLESS_MAX_DURATION_S } from "@/lib/jobs/config";
import { maxDuration, POST } from "./route";

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.job.deleteMany();
  await db.site.deleteMany();
  after.mockClear();
  vi.unstubAllEnvs();
});

const add = (gscProperty: string) =>
  POST(new Request("http://localhost/api/sites", { method: "POST", body: JSON.stringify({ gscProperty }) }));

describe("POST /api/sites", () => {
  it("queues the initial GSC sync for the new site", async () => {
    const res = await add("sc-domain:quilltab.app");
    expect(res.status).toBe(201);
    const site = (await res.json()) as { id: string };
    expect(await db.job.findFirstOrThrow({ where: { siteId: site.id } })).toMatchObject({
      type: "gsc-sync",
      source: "site-added",
      status: "QUEUED",
    });
  });

  it("on a serverless host runs that sync after the response, within the route's time limit", async () => {
    vi.stubEnv("VERCEL", "1");
    expect((await add("sc-domain:quilltab.app")).status).toBe(201);
    expect(after).toHaveBeenCalledTimes(1);
    expect(maxDuration).toBe(SERVERLESS_MAX_DURATION_S);
  });
});
