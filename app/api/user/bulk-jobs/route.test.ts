import type { Job, PrismaClient } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({
  db: null as PrismaClient | null,
  userId: "u1" as string | null,
}));
const calls = vi.hoisted(() => ({
  after: vi.fn(),
  dispatch: vi.fn(),
  gsc: vi.fn(),
  bing: vi.fn(),
  vitals: vi.fn(),
  crawl: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  auth: async () => (state.userId ? { user: { id: state.userId } } : null),
}));
vi.mock("@/lib/db", async () => ({
  db: (await import("@/lib/testing/pglite")).lazyDb(state),
}));
vi.mock("next/server", () => ({ after: calls.after }));
vi.mock("@/lib/jobs/dispatch", () => ({ dispatchJob: calls.dispatch }));
vi.mock("@/lib/workers/gsc-sync", () => ({ runGSCSync: calls.gsc }));
vi.mock("@/lib/workers/bing-sync", () => ({ syncBingDataForSite: calls.bing }));
vi.mock("@/lib/workers/vitals-sync", () => ({
  syncVitalsForSite: calls.vitals,
}));
vi.mock("@/lib/crawler/engine", () => ({ runSiteCrawl: calls.crawl }));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { ReauthRequiredError } from "@/lib/google";
import { runBulkJob } from "@/lib/bulk/worker";
import type { BulkJobView } from "@/lib/bulk/types";
import { claimJobById, enqueueJob } from "@/lib/jobs/queue";
import { JobRunner } from "@/lib/jobs/runner";
import { JobError } from "@/lib/jobs/types";
import { setCrawlPolicy } from "@/lib/jobs/policy";
import { GET, POST, PATCH } from "./route";

let testDb: TestDb;
let db: PrismaClient;
let background: Promise<unknown>[] = [];
beforeAll(async () => {
  testDb = await createTestDb();
  db = state.db = testDb.db;
  await db.user.createMany({
    data: [
      { id: "u1", email: "one@example.test" },
      { id: "u2", email: "two@example.test" },
    ],
  });
  await db.site.createMany({
    data: [
      {
        id: "s1",
        userId: "u1",
        domain: "one.test",
        gscProperty: "sc-domain:one.test",
        bingSite: "https://one.test/",
      },
      {
        id: "s2",
        userId: "u1",
        domain: "two.test",
        gscProperty: "sc-domain:two.test",
        bingSite: "https://two.test/",
      },
      { id: "s3", userId: "u1", domain: "unconnected.test" },
      {
        id: "foreign",
        userId: "u2",
        domain: "foreign.test",
        gscProperty: "sc-domain:foreign.test",
      },
    ],
  });
}, 120_000);
afterAll(async () => {
  await testDb?.close();
});
beforeEach(async () => {
  vi.stubEnv("VERCEL", "");
  state.userId = "u1";
  background = [];
  await db.bulkJob.deleteMany();
  await db.job.deleteMany();
  await db.crawl.deleteMany();
  await db.apiKey.deleteMany();
  await db.site.update({
    where: { id: "s2" },
    data: { userId: "u1", gscProperty: "sc-domain:two.test" },
  });
  for (const mock of Object.values(calls)) mock.mockReset();
  calls.gsc.mockResolvedValue({ keywordsInserted: 3, pagesInserted: 5 });
  calls.bing.mockResolvedValue({
    success: true,
    queriesUpserted: 3,
    pagesUpserted: 4,
    daysUpserted: 1,
  });
  calls.vitals.mockResolvedValue({
    inserted: 1,
    results: [{ url: "https://one.test/", perfScore: 95 }],
  });
  calls.crawl.mockImplementation(async (_site, _domain, _limit, crawlId) => {
    await db.crawl.update({
      where: { id: crawlId },
      data: { status: "COMPLETED", pagesFound: 25, issuesFound: 3 },
    });
    return { pagesFound: 25, issuesFound: 3, healthScore: 90 };
  });
  // Real queue claims, built-in handlers, results, retries and follow-ups.
  // Only the external providers and the process wake-up boundary are mocked.
  calls.dispatch.mockImplementation((_db, job: Job) => {
    background.push(work(job.id));
  });
});
afterEach(async () => {
  await Promise.all(background);
  setCrawlPolicy(null);
  vi.unstubAllEnvs();
});
async function work(id: string) {
  const runner = new JobRunner(db, { log: () => {} });
  const claimed = await claimJobById(db, {
    workerId: runner.workerId,
    jobId: id,
  });
  if (claimed) return runner.execute(claimed);
}
const request = (method: string, body?: unknown, query = "") =>
  new Request(`http://localhost/api/user/bulk-jobs${query}`, {
    method,
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  });
const options = {
  siteIds: ["s1", "s2"],
  actions: ["gsc"],
  maxPages: 100,
  vitalsLimit: 1,
};
async function create(overrides = {}) {
  const response = await POST(request("POST", { ...options, ...overrides }));
  expect(response.status).toBe(202);
  return ((await response.json()) as { job: BulkJobView }).job;
}
async function read(id: string) {
  return (
    (await (await GET(request("GET", undefined, `?id=${id}`))).json()) as {
      job: BulkJobView;
    }
  ).job;
}
const stop = (id: string) => PATCH(request("PATCH", { id }));
async function runningJob(batchId: string) {
  let id: string | undefined;
  await vi.waitFor(
    async () => {
      id = (await read(batchId)).tasks.find(
        (task) => task.status === "running",
      )?.jobId;
      expect(id).toBeTruthy();
    },
    { timeout: 5000 },
  );
  return id!;
}

describe("portfolio authorization and persistence", () => {
  it("requires authentication for starting, reading and stopping", async () => {
    state.userId = null;
    expect((await POST(request("POST", options))).status).toBe(401);
    expect((await GET(request("GET"))).status).toBe(401);
    expect((await stop("anything")).status).toBe(401);
    expect(await db.bulkJob.count()).toBe(0);
  });
  it.each([
    { siteIds: [] },
    { actions: [] },
    { actions: ["delete"] },
    { maxPages: 2001 },
    { maxPages: 1.5 },
    { vitalsLimit: 0 },
    { vitalsLimit: 6 },
  ])("rejects invalid options %j", async (overrides) => {
    expect(
      (await POST(request("POST", { ...options, ...overrides }))).status,
    ).toBe(400);
    expect(await db.bulkJob.count()).toBe(0);
  });
  it("rejects malformed start and cancel bodies", async () => {
    expect(
      (
        await POST(
          new Request("http://localhost", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
    expect((await PATCH(request("PATCH", {}))).status).toBe(400);
  });
  it("does not create a batch or schedule work on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    expect((await POST(request("POST", options))).status).toBe(503);
    expect(await db.bulkJob.count()).toBe(0);
    expect(calls.after).not.toHaveBeenCalled();
  });
  it("rejects another user's site before scheduling anything", async () => {
    expect(
      (await POST(request("POST", { ...options, siteIds: ["s1", "foreign"] })))
        .status,
    ).toBe(404);
    expect(calls.after).not.toHaveBeenCalled();
  });
  it("deduplicates selections and skips missing connections", async () => {
    const job = await create({
      siteIds: ["s1", "s1", "s3"],
      actions: ["gsc", "gsc"],
    });
    expect(job.tasks).toHaveLength(2);
    expect(job.tasks.find((task) => task.siteId === "s3")?.status).toBe(
      "skipped",
    );
    expect(calls.after).toHaveBeenCalledOnce();
  });
  it("rejects a batch without eligible work", async () => {
    expect(
      (await POST(request("POST", { ...options, siteIds: ["s3"] }))).status,
    ).toBe(400);
  });
  it("allows only one active batch even for simultaneous starts", async () => {
    const responses = await Promise.all([
      POST(request("POST", options)),
      POST(request("POST", options)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 409,
    ]);
    expect(await db.bulkJob.count()).toBe(1);
  });
  it("the migration index rejects overlapping active batches directly", async () => {
    await create();
    const duplicate = await db.bulkJob.createMany({
      data: [{ userId: "u1", tasks: [], options: {} }],
      skipDuplicates: true,
    });
    expect(duplicate.count).toBe(0);
    await db.bulkJob.create({ data: { userId: "u2", tasks: [], options: {} } });
    await db.bulkJob.create({
      data: { userId: "u1", status: "COMPLETED", tasks: [], options: {} },
    });
  });
  it("does not expose or cancel another user's batch", async () => {
    const job = await create();
    state.userId = "u2";
    expect((await GET(request("GET", undefined, `?id=${job.id}`))).status).toBe(
      404,
    );
    expect((await stop(job.id)).status).toBe(404);
    expect((await (await GET(request("GET"))).json()).job).toBeNull();
    expect(
      (await db.bulkJob.findUniqueOrThrow({ where: { id: job.id } }))
        .cancelRequested,
    ).toBe(false);
  });
  it("recovers abandoned work and retains results and the underlying job reference", async () => {
    const job = await create();
    await db.bulkJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        heartbeatAt: new Date(Date.now() - 4 * 60_000),
        tasks: [
          { ...job.tasks[0], status: "completed" },
          { ...job.tasks[1], status: "running", jobId: "surviving-job" },
        ],
      },
    });
    const recovered = await read(job.id);
    expect(recovered.status).toBe("FAILED");
    expect(recovered.tasks.map((task) => task.status)).toEqual([
      "completed",
      "failed",
    ]);
    expect(recovered.tasks[1].jobId).toBe("surviving-job");
    await create();
  });
});

describe("batch integration with the normal job queue", () => {
  it("runs the after callback, saves results and queues the normal alert follow-ups", async () => {
    const job = await create();
    await calls.after.mock.calls[0][0]();
    const result = await read(job.id);
    expect(result.status).toBe("COMPLETED");
    expect(result.tasks.map((task) => task.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(result.tasks[0].message).toBe(
      "3 keyword records and 5 page records synced",
    );
    expect((await (await GET(request("GET"))).json()).job).toEqual(result);
    expect(await db.job.count({ where: { type: "alerts-evaluate" } })).toBe(2);
  });
  it("continues after one site's permanent failure", async () => {
    calls.gsc.mockRejectedValueOnce(
      new JobError("Network failure", { permanent: true }),
    );
    const job = await create();
    await runBulkJob(job.id);
    expect((await read(job.id)).tasks.map((task) => task.status)).toEqual([
      "failed",
      "completed",
    ]);
    expect(calls.gsc).toHaveBeenCalledTimes(2);
  });
  it("claims a batch only once", async () => {
    const job = await create();
    await Promise.all([runBulkJob(job.id), runBulkJob(job.id)]);
    expect(calls.gsc).toHaveBeenCalledTimes(2);
  });
  it("rechecks ownership and connections at execution time", async () => {
    const job = await create();
    await db.site.update({ where: { id: "s2" }, data: { userId: "u2" } });
    await runBulkJob(job.id);
    expect(calls.gsc).toHaveBeenCalledTimes(1);
    expect((await read(job.id)).tasks[1]).toMatchObject({
      status: "skipped",
      message: "Website no longer available",
    });
  });
  it("stops further GSC calls after reauthorization is required, but runs PageSpeed", async () => {
    calls.gsc.mockRejectedValueOnce(new ReauthRequiredError());
    const job = await create({ actions: ["gsc", "vitals"] });
    await runBulkJob(job.id);
    expect(calls.gsc).toHaveBeenCalledOnce();
    expect(calls.vitals).toHaveBeenCalledTimes(2);
    expect((await read(job.id)).tasks.map((task) => task.status)).toEqual([
      "failed",
      "skipped",
      "completed",
      "completed",
    ]);
  }, 15_000);
  it("preserves partial PageSpeed results and stops further quota failures", async () => {
    calls.vitals.mockResolvedValueOnce({
      inserted: 1,
      errorCode: "QUOTA_EXCEEDED",
      results: [{ perfScore: 90 }, { error: "quota" }],
    });
    const job = await create({ actions: ["vitals"], vitalsLimit: 3 });
    await runBulkJob(job.id);
    expect(calls.vitals).toHaveBeenCalledExactlyOnceWith("u1", "s1", 3);
    const result = await read(job.id);
    expect(result.tasks.map((task) => task.status)).toEqual([
      "partial",
      "skipped",
    ]);
    expect(result.tasks[0].values).toEqual({ count: 1 });
  });
  it("stops PageSpeed calls after total quota failure", async () => {
    calls.vitals.mockResolvedValueOnce({
      inserted: 0,
      error: "quota",
      errorCode: "QUOTA_EXCEEDED",
      results: [{ error: "quota" }],
    });
    const job = await create({ actions: ["vitals"] });
    await runBulkJob(job.id);
    expect(calls.vitals).toHaveBeenCalledOnce();
    expect((await read(job.id)).tasks.map((task) => task.status)).toEqual([
      "failed",
      "skipped",
    ]);
  });
  it("skips Bing without a key", async () => {
    const job = await create({ actions: ["bing"] });
    await runBulkJob(job.id);
    expect(calls.bing).not.toHaveBeenCalled();
    expect(
      (await read(job.id)).tasks.every((task) => task.status === "skipped"),
    ).toBe(true);
  });
  it("keeps partial Bing results without stopping the next website", async () => {
    await db.apiKey.create({
      data: { userId: "u1", provider: "bing", encryptedPassword: "test-only" },
    });
    calls.bing.mockResolvedValueOnce({
      success: true,
      queriesUpserted: 2,
      pagesUpserted: 0,
      partial: ["pages"],
    });
    const job = await create({ actions: ["bing"] });
    await runBulkJob(job.id);
    expect((await read(job.id)).tasks.map((task) => task.status)).toEqual([
      "partial",
      "completed",
    ]);
  });
  it("honors the server crawl ceiling and the registered policy", async () => {
    vi.stubEnv("CRAWL_MAX_PAGES", "60");
    setCrawlPolicy(async (site, ctx) => {
      expect(ctx.maxPages).toBe(60);
      return site.id === "s2"
        ? { ok: false, status: 403, reason: "Crawling disabled" }
        : { ok: true };
    });
    const job = await create({ actions: ["crawl"] });
    await runBulkJob(job.id);
    expect(calls.crawl).toHaveBeenCalledOnce();
    expect(calls.crawl.mock.calls[0][2]).toBe(60);
    expect((await read(job.id)).tasks.map((task) => task.status)).toEqual([
      "completed",
      "skipped",
    ]);
  });
  it("reuses a scheduled queued crawl, including the selected page limit", async () => {
    const scheduled = await enqueueJob(db, {
      type: "crawl",
      siteId: "s1",
      source: "schedule",
      payload: { maxPages: 25 },
    });
    const job = await create({ actions: ["crawl"], siteIds: ["s1"] });
    await runBulkJob(job.id);
    expect((await read(job.id)).tasks[0].jobId).toBe(scheduled.job.id);
    expect(calls.crawl.mock.calls[0][2]).toBe(100);
    expect(await db.job.count({ where: { type: "crawl" } })).toBe(1);
  });
  it("skips a running scheduled crawl without touching it", async () => {
    const scheduled = await enqueueJob(db, {
      type: "crawl",
      siteId: "s1",
      source: "schedule",
    });
    await claimJobById(db, {
      workerId: "other-worker",
      jobId: scheduled.job.id,
    });
    const job = await create({ actions: ["crawl"], siteIds: ["s1"] });
    await runBulkJob(job.id);
    expect(calls.crawl).not.toHaveBeenCalled();
    expect((await read(job.id)).tasks[0].status).toBe("skipped");
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: scheduled.job.id } }))
        .lockedBy,
    ).toBe("other-worker");
  });
  it("waits for a separate worker and serializes steps until that worker finishes", async () => {
    calls.dispatch.mockImplementation(() => {});
    const job = await create({ actions: ["crawl"] });
    const running = runBulkJob(job.id);
    const first = await runningJob(job.id);
    expect(await db.job.count({ where: { type: "crawl" } })).toBe(1);
    await work(first);
    let second = "";
    await vi.waitFor(
      async () => {
        second = (await read(job.id)).tasks[1].jobId ?? "";
        expect(second).not.toBe("");
      },
      { timeout: 5000 },
    );
    await work(second);
    await running;
    expect(
      (await read(job.id)).tasks.every(
        (task) => task.status === "completed" && task.values?.pages === 25,
      ),
    ).toBe(true);
  }, 15_000);
  it("waits through job retries instead of starting the next batch step", async () => {
    calls.dispatch.mockImplementation(() => {});
    calls.gsc.mockRejectedValueOnce(new Error("temporary"));
    const job = await create({ siteIds: ["s1"] });
    const running = runBulkJob(job.id);
    const id = await runningJob(job.id);
    await work(id);
    expect((await db.job.findUniqueOrThrow({ where: { id } })).status).toBe(
      "QUEUED",
    );
    expect((await read(job.id)).status).toBe("RUNNING");
    await db.job.update({ where: { id }, data: { runAt: new Date() } });
    await work(id);
    await running;
    expect((await read(job.id)).tasks[0].status).toBe("completed");
    expect(calls.gsc).toHaveBeenCalledTimes(2);
  });
});

describe("stopping the batch", () => {
  it("stops before the first step without creating any jobs", async () => {
    const job = await create();
    await stop(job.id);
    await runBulkJob(job.id);
    expect((await read(job.id)).status).toBe("CANCELLED");
    expect(await db.job.count()).toBe(0);
  });
  it.each([["s1", "s2"], ["s1"]])(
    "stops while a crawl is running, including the final step: %j",
    async (...siteIds) => {
      let finish!: () => void;
      calls.crawl.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ pagesFound: 25, issuesFound: 3 });
          }),
      );
      const job = await create({ siteIds, actions: ["crawl"] });
      const running = runBulkJob(job.id);
      try {
        const id = await runningJob(job.id);
        await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
        await stop(job.id);
        await running;
        const stopped = await read(job.id);
        expect(stopped.status).toBe("CANCELLED");
        expect(stopped.tasks.every((task) => task.status === "cancelled")).toBe(
          true,
        );
        expect(stopped.tasks[0].message).toContain("continues separately");
        expect((await db.job.findUniqueOrThrow({ where: { id } })).status).toBe(
          "RUNNING",
        );
        expect(calls.crawl).toHaveBeenCalledOnce();
      } finally {
        finish?.();
        await running;
      }
    },
  );
  it("stops while waiting for a queued job without cancelling that job", async () => {
    calls.dispatch.mockImplementation(() => {});
    const job = await create();
    const running = runBulkJob(job.id);
    const id = await runningJob(job.id);
    await stop(job.id);
    await running;
    expect((await read(job.id)).status).toBe("CANCELLED");
    expect((await db.job.findUniqueOrThrow({ where: { id } })).status).toBe(
      "QUEUED",
    );
    expect(await db.job.count()).toBe(1);
  });
  it("does not replace an interrupted batch's state when its child finishes", async () => {
    calls.dispatch.mockImplementation(() => {});
    const job = await create();
    const running = runBulkJob(job.id);
    const id = await runningJob(job.id);
    await db.bulkJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
    await work(id);
    await running;
    expect((await read(job.id)).status).toBe("FAILED");
    expect(calls.gsc).toHaveBeenCalledOnce();
  });
});
