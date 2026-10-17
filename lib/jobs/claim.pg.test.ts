import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Concurrent claims on a real Postgres server, with separate clients standing
// in for separate processes. PGlite (the other tests) runs one connection, so
// it cannot show that FOR UPDATE SKIP LOCKED hands every job to one claimer
// only. Runs when TEST_DATABASE_URL points at a migrated database (CI sets it).

vi.mock("@/lib/db", () => ({ db: {} }));

import { registerJobHandler } from "./handlers";
import { claimJobById, claimJobs, enqueueJob } from "./queue";

const url = process.env.TEST_DATABASE_URL;
const run = randomBytes(4).toString("hex");
const type = `pg-claim-${run}`;
const userId = `pg-user-${run}`;

registerJobHandler({ type, class: "SHORT", maxAttempts: 1, isPermanent: () => false, run: async () => undefined });

function client() {
  const sep = url!.includes("?") ? "&" : "?";
  return new PrismaClient({ datasourceUrl: `${url}${sep}connection_limit=4` });
}

describe.skipIf(!url)("claiming on a real Postgres server", () => {
  let a: PrismaClient;
  let b: PrismaClient;
  const sites: string[] = [];

  beforeAll(async () => {
    a = client();
    b = client();
    await a.user.create({ data: { id: userId, email: `${userId}@test.invalid` } });
    for (let i = 0; i < 4; i++) {
      const site = await a.site.create({ data: { userId, domain: `s${i}.${run}.test.invalid` } });
      sites.push(site.id);
    }
  }, 60_000);

  afterAll(async () => {
    // Cascades to the sites and their jobs.
    await a?.user.deleteMany({ where: { id: userId } });
    await a?.$disconnect();
    await b?.$disconnect();
  });

  it("never hands one job to two claimers", async () => {
    const N = 60;
    await a.job.createMany({
      data: Array.from({ length: N }, (_, i) => ({
        type,
        siteId: sites[i % sites.length],
        source: "manual",
        maxAttempts: 1,
      })),
    });

    const claimAll = async (db: PrismaClient, workerId: string) => {
      const got: string[] = [];
      for (;;) {
        const jobs = await claimJobs(db, { workerId, types: [type], limit: 3 });
        if (jobs.length === 0) return got;
        for (const j of jobs) expect(j.lockedBy).toBe(workerId);
        got.push(...jobs.map((j) => j.id));
      }
    };
    const results = await Promise.all([
      claimAll(a, "a1"),
      claimAll(b, "b1"),
      claimAll(a, "a2"),
      claimAll(b, "b2"),
    ]);
    const all = results.flat();
    expect(all).toHaveLength(N);
    expect(new Set(all).size).toBe(N);

    const rows = await a.job.findMany({ where: { type }, select: { id: true, lockedBy: true, attempts: true } });
    expect(rows.every((r) => r.attempts === 1)).toBe(true);
    const owner = new Map(results.flatMap((ids, i) => ids.map((id) => [id, ["a1", "b1", "a2", "b2"][i]])));
    for (const r of rows) expect(r.lockedBy).toBe(owner.get(r.id));
    await a.job.deleteMany({ where: { type } });
  }, 60_000);

  it("one winner when two processes claim the same job by id", async () => {
    const { job } = await enqueueJob(a, { type, siteId: sites[0], source: "manual" });
    const claimed = await Promise.all(
      Array.from({ length: 8 }, (_, i) => claimJobById(i % 2 ? b : a, { workerId: `w${i}`, jobId: job.id }))
    );
    expect(claimed.filter(Boolean)).toHaveLength(1);
    await a.job.deleteMany({ where: { type } });
  }, 60_000);

  it("one active job when two processes queue the same work at once", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => enqueueJob(i % 2 ? b : a, { type, siteId: sites[1], source: "schedule" }))
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.job.id)).size).toBe(1);
    expect(await a.job.count({ where: { type } })).toBe(1);
    await a.job.deleteMany({ where: { type } });
  }, 60_000);
});
