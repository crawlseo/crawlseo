import type { PrismaClient } from "@prisma/client";
import {
  afterAll,
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
vi.mock("@/lib/workers/gsc-sync", () => ({ runGSCSync: calls.gsc }));
vi.mock("@/lib/workers/bing-sync", () => ({ syncBingDataForSite: calls.bing }));
vi.mock("@/lib/workers/vitals-sync", () => ({
  syncVitalsForSite: calls.vitals,
}));
vi.mock("@/lib/crawler/lifecycle", () => ({
  startSiteCrawl: calls.crawl,
  recoverStaleCrawls: vi.fn(),
}));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { ReauthRequiredError } from "@/lib/google";
import { runBulkJob } from "@/lib/bulk/worker";
import type { BulkJobView } from "@/lib/bulk/types";
import { GET, POST, PATCH } from "./route";

let testDb: TestDb;
let db: PrismaClient;
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
  state.userId = "u1";
  await db.bulkJob.deleteMany();
  await db.crawl.deleteMany();
  await db.apiKey.deleteMany();
  for (const mock of Object.values(calls)) mock.mockReset();
  calls.gsc.mockResolvedValue({ keywordsInserted: 3, pagesInserted: 5 });
  calls.bing.mockResolvedValue({
    success: true,
    queriesUpserted: 3,
    pagesUpserted: 4,
  });
  calls.vitals.mockResolvedValue({
    inserted: 1,
    results: [{ url: "https://one.test/", perfScore: 95 }],
  });
  calls.crawl.mockResolvedValue({ started: false, runningCrawlId: "existing" });
});
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

describe("portfolio action authorization and validation", () => {
  it("requires authentication for starting, reading and stopping batches", async () => {
    state.userId = null;
    expect((await POST(request("POST", options))).status).toBe(401);
    expect((await GET(request("GET"))).status).toBe(401);
    expect((await PATCH(request("PATCH", { id: "anything" }))).status).toBe(
      401,
    );
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
  it("rejects a selection containing another user's site without running anything", async () => {
    expect(
      (await POST(request("POST", { ...options, siteIds: ["s1", "foreign"] })))
        .status,
    ).toBe(404);
    expect(calls.after).not.toHaveBeenCalled();
    expect(await db.bulkJob.count()).toBe(0);
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
  it("refuses a batch with no eligible work", async () => {
    expect(
      (await POST(request("POST", { ...options, siteIds: ["s3"] }))).status,
    ).toBe(400);
  });
  it("allows only one active job even for simultaneous requests", async () => {
    const responses = await Promise.all([
      POST(request("POST", options)),
      POST(request("POST", options)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 409,
    ]);
    expect(await db.bulkJob.count()).toBe(1);
  });
  it("does not expose or cancel another user's job", async () => {
    const job = await create();
    state.userId = "u2";
    expect((await GET(request("GET", undefined, `?id=${job.id}`))).status).toBe(
      404,
    );
    expect((await PATCH(request("PATCH", { id: job.id }))).status).toBe(404);
    expect((await (await GET(request("GET"))).json()).job).toBeNull();
    expect(
      (await db.bulkJob.findUniqueOrThrow({ where: { id: job.id } }))
        .cancelRequested,
    ).toBe(false);
  });
  it("marks abandoned work interrupted while preserving completed results", async () => {
    const job = await create();
    await db.bulkJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        heartbeatAt: new Date(Date.now() - 4 * 60_000),
        tasks: [
          { ...job.tasks[0], status: "completed" },
          { ...job.tasks[1], status: "running" },
        ],
      },
    });
    const recovered = await read(job.id);
    expect(recovered.status).toBe("FAILED");
    expect(recovered.tasks.map((task) => task.status)).toEqual([
      "completed",
      "failed",
    ]);
    await create();
  });
});

describe("background batch execution", () => {
  it("continues after a site failure and exposes persisted results after reload", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    calls.gsc.mockRejectedValueOnce(new Error("Network failure"));
    const job = await create();
    await runBulkJob(job.id);
    const result = await read(job.id);
    expect(result.status).toBe("COMPLETED");
    expect(result.tasks.map((task) => task.status)).toEqual([
      "failed",
      "completed",
    ]);
    expect((await (await GET(request("GET"))).json()).job.id).toBe(job.id);
    expect(calls.gsc).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
  it("serializes steps and stops pending work after the current step", async () => {
    let finish!: () => void;
    calls.gsc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ keywordsInserted: 1, pagesInserted: 1 });
        }),
    );
    const job = await create();
    const running = runBulkJob(job.id);
    await vi.waitFor(() => expect(calls.gsc).toHaveBeenCalledOnce());
    expect((await read(job.id)).tasks.map((task) => task.status)).toEqual([
      "running",
      "pending",
    ]);
    expect((await PATCH(request("PATCH", { id: job.id }))).status).toBe(200);
    finish();
    await running;
    const result = await read(job.id);
    expect(result.status).toBe("CANCELLED");
    expect(result.tasks.map((task) => task.status)).toEqual([
      "completed",
      "cancelled",
    ]);
    expect(calls.gsc).toHaveBeenCalledOnce();
  });
  it("claims a queued job only once", async () => {
    const job = await create();
    await Promise.all([runBulkJob(job.id), runBulkJob(job.id)]);
    expect(calls.gsc).toHaveBeenCalledTimes(2);
  });
  it("stops remaining GSC calls after Google requires reauthentication", async () => {
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
  });
  it("preserves partial PageSpeed results and stops additional quota failures", async () => {
    calls.vitals.mockResolvedValueOnce({
      inserted: 1,
      errorCode: "QUOTA_EXCEEDED",
      results: [
        { url: "https://one.test/", perfScore: 90 },
        { url: "https://one.test/about", error: "quota" },
      ],
    });
    const job = await create({ actions: ["vitals"] });
    await runBulkJob(job.id);
    expect(calls.vitals).toHaveBeenCalledExactlyOnceWith("u1", "s1", 1);
    const result = await read(job.id);
    expect(result.tasks.map((task) => task.status)).toEqual([
      "partial",
      "skipped",
    ]);
    expect(result.tasks[0].values).toEqual({ count: 1 });
  });
  it("skips Bing without an API key", async () => {
    const job = await create({ actions: ["bing"] });
    await runBulkJob(job.id);
    expect(calls.bing).not.toHaveBeenCalled();
    expect(
      (await read(job.id)).tasks.every((task) => task.status === "skipped"),
    ).toBe(true);
  });
  it("reports partial Bing results without stopping the next website", async () => {
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
    expect(calls.bing).toHaveBeenCalledTimes(2);
    expect((await read(job.id)).tasks.map((task) => task.status)).toEqual([
      "partial",
      "completed",
    ]);
  });
  it("skips existing crawls and passes the selected page limit", async () => {
    const job = await create({ actions: ["crawl"] });
    await runBulkJob(job.id);
    expect(calls.crawl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "s1" }),
      100,
    );
    expect(
      (await read(job.id)).tasks.every((task) => task.status === "skipped"),
    ).toBe(true);
  });
  it("waits for each crawl to finish before starting the next", async () => {
    calls.crawl.mockImplementation(async (_db, site) => {
      const crawl = await db.crawl.create({
        data: {
          siteId: site.id,
          status: "COMPLETED",
          pagesFound: 25,
          issuesFound: 3,
        },
      });
      return { started: true, crawlId: crawl.id };
    });
    const job = await create({ actions: ["crawl"] });
    const running = runBulkJob(job.id);
    await vi.waitFor(() => expect(calls.crawl).toHaveBeenCalledOnce());
    expect((await read(job.id)).tasks.map((task) => task.status)).toEqual([
      "running",
      "pending",
    ]);
    await running;
    expect(calls.crawl).toHaveBeenCalledTimes(2);
    expect(
      (await read(job.id)).tasks.every(
        (task) => task.status === "completed" && task.values?.pages === 25,
      ),
    ).toBe(true);
  }, 15_000);
});
