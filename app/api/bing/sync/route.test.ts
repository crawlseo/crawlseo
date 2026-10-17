import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, PrismaClient } from "@prisma/client";

const db = vi.hoisted(() => ({ site: { findUnique: vi.fn() }, apiKey: { count: vi.fn(async () => 1) } }));
const sync = vi.hoisted(() => vi.fn());
const { requestSiteJob, dispatchJob } = vi.hoisted(() => ({
  requestSiteJob: vi.fn(async () => ({ job: { id: "job-1", status: "QUEUED" }, created: true })),
  dispatchJob: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/workers/bing-sync", () => ({ syncBingDataForSite: sync }));
vi.mock("@/lib/jobs/site-jobs", () => ({ requestSiteJob }));
vi.mock("@/lib/jobs/dispatch", () => ({ dispatchJob }));

import { POST } from "./route";
import { BING_SYNC_JOB, getJobHandler } from "@/lib/jobs/handlers";

const post = (siteId: string) =>
  POST(
    new Request("http://localhost/api/bing/sync", {
      method: "POST",
      body: JSON.stringify({ siteId }),
    })
  );

function runBingJob() {
  const job = { id: "job-1", siteId: "site-a", type: BING_SYNC_JOB, attempts: 1, maxAttempts: 3 } as Job;
  return getJobHandler(BING_SYNC_JOB)!.run({
    db: db as unknown as PrismaClient,
    job,
    workerId: "test",
    signal: new AbortController().signal,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/bing/sync", () => {
  // Like /api/gsc/sync: a site that does not exist and someone else's site get
  // the same 404, so the status does not reveal which ids exist.
  it("answers 404 for an unknown site and for another user's site", async () => {
    db.site.findUnique.mockResolvedValueOnce(null);
    expect((await post("nope")).status).toBe(404);

    db.site.findUnique.mockResolvedValueOnce({
      userId: "user-2",
      bingSite: "https://a.example/",
    });
    expect((await post("site-b")).status).toBe(404);

    expect(requestSiteJob).not.toHaveBeenCalled();
  });

  it("answers 400 when the site has no Bing property", async () => {
    db.site.findUnique.mockResolvedValueOnce({ userId: "user-1", bingSite: null });
    expect((await post("site-a")).status).toBe(400);
    expect(requestSiteJob).not.toHaveBeenCalled();
  });

  it("queues a sync job and answers 202 with its id", async () => {
    db.site.findUnique.mockResolvedValueOnce({ userId: "user-1", bingSite: "https://a.example/" });
    const res = await post("site-a");
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job-1", status: "QUEUED" });
    expect(requestSiteJob).toHaveBeenCalledWith(db, { type: BING_SYNC_JOB, siteId: "site-a", source: "manual" });
    expect(sync).not.toHaveBeenCalled();
  });
});

describe("bing-sync job", () => {
  const site = { id: "site-a", userId: "user-1", bingSite: "https://a.example/" };

  it("fails permanently without a Bing key, without calling Bing", async () => {
    db.site.findUnique.mockResolvedValueOnce(site);
    db.apiKey.count.mockResolvedValueOnce(0);
    const err = await runBingJob().catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "KEY_MISSING", permanent: true });
    expect(sync).not.toHaveBeenCalled();
  });

  it("lets a failed sync retry", async () => {
    db.site.findUnique.mockResolvedValueOnce(site);
    sync.mockResolvedValueOnce({ success: false, error: "every Bing endpoint failed (traffic)" });
    const err = await runBingJob().catch((e: unknown) => e);
    expect(err).toMatchObject({ message: "every Bing endpoint failed (traffic)" });
    expect(getJobHandler(BING_SYNC_JOB)!.isPermanent(err)).toBe(false);
  });

  it("keeps the old response shape as its result", async () => {
    db.site.findUnique.mockResolvedValueOnce(site);
    sync.mockResolvedValueOnce({ success: true, daysUpserted: 3, queriesUpserted: 2, pagesUpserted: 1, partial: ["crawl"] });
    expect(await runBingJob()).toEqual({
      success: true,
      daysUpserted: 3,
      queriesUpserted: 2,
      pagesUpserted: 1,
      partial: ["crawl"],
    });
  });
});
