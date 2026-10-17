import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { db, fetchSearchAnalytics, fetchPageAnalytics, FakeReauthError } = vi.hoisted(() => {
  class FakeReauthError extends Error {
    constructor() {
      super("Google access expired");
      this.name = "ReauthRequiredError";
    }
  }
  return {
    db: {
      site: { findUnique: vi.fn() },
      keyword: { upsert: vi.fn() },
      page: { upsert: vi.fn() },
    },
    fetchSearchAnalytics: vi.fn(),
    fetchPageAnalytics: vi.fn(),
    FakeReauthError,
  };
});

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "user-1" } })) }));
vi.mock("@/lib/google", async () => {
  const { gscDate } = await import("@/lib/google/gsc-date");
  return {
    fetchSearchAnalytics,
    fetchPageAnalytics,
    gscDate,
    ReauthRequiredError: FakeReauthError,
  };
});

const { requestSiteJob, dispatchJob } = vi.hoisted(() => ({
  requestSiteJob: vi.fn(async () => ({ job: { id: "job-1", status: "QUEUED" }, created: true })),
  dispatchJob: vi.fn(),
}));
vi.mock("@/lib/jobs/site-jobs", () => ({ requestSiteJob }));
vi.mock("@/lib/jobs/dispatch", () => ({ dispatchJob }));

import type { Job, PrismaClient } from "@prisma/client";
import { POST } from "./route";
import { syncGSCDataForSite } from "@/lib/workers/gsc-sync";
import { getJobHandler, GSC_SYNC_JOB } from "@/lib/jobs/handlers";
import { JobError } from "@/lib/jobs/types";

/** The sync the route queues, run the way the queue runs it. */
function runSyncJob() {
  const job = { id: "job-1", siteId: "site-1", type: GSC_SYNC_JOB, attempts: 1, maxAttempts: 3 } as Job;
  return getJobHandler(GSC_SYNC_JOB)!.run({
    db: db as unknown as PrismaClient,
    job,
    workerId: "test",
    signal: new AbortController().signal,
  });
}

const GSC_DAY = "2026-09-14";
const keywordRow = {
  query: "crm for startups",
  page: "https://quilltab.app/pricing",
  date: GSC_DAY,
  device: "MOBILE",
  country: "usa",
  clicks: 7,
  impressions: 120,
  ctr: 0.058,
  position: 4.2,
};
const pageRow = {
  page: "https://quilltab.app/pricing",
  date: GSC_DAY,
  clicks: 9,
  impressions: 150,
  ctr: 0.06,
  position: 3.9,
};

function syncRequest() {
  return new Request("http://localhost/api/gsc/sync", {
    method: "POST",
    body: JSON.stringify({ siteId: "site-1" }),
  });
}

function writtenDates() {
  return {
    keyword: db.keyword.upsert.mock.calls.map(([args]) => [
      args.where.siteId_query_date.date.toISOString(),
      args.create.date.toISOString(),
    ]),
    page: db.page.upsert.mock.calls.map(([args]) => [
      args.where.siteId_url_date.date.toISOString(),
      args.create.date.toISOString(),
    ]),
  };
}

const originalTZ = process.env.TZ;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  db.site.findUnique.mockResolvedValue({ userId: "user-1", gscProperty: "sc-domain:quilltab.app" });
  fetchSearchAnalytics.mockResolvedValue([keywordRow]);
  fetchPageAnalytics.mockResolvedValue([pageRow]);
});

afterAll(() => {
  process.env.TZ = originalTZ;
});

describe.each(["Europe/Madrid", "America/New_York"])("GSC sync under TZ=%s", (tz) => {
  it("the sync job and the worker write the same date for the same GSC row", async () => {
    process.env.TZ = tz;

    await runSyncJob();
    const fromRoute = writtenDates();

    vi.clearAllMocks();
    db.site.findUnique.mockResolvedValue({ userId: "user-1", gscProperty: "sc-domain:quilltab.app" });
    fetchSearchAnalytics.mockResolvedValue([keywordRow]);
    fetchPageAnalytics.mockResolvedValue([pageRow]);

    const result = await syncGSCDataForSite("user-1", "site-1");
    expect(result.success).toBe(true);
    const fromWorker = writtenDates();

    const utcMidnight = "2026-09-14T00:00:00.000Z";
    expect(fromRoute.keyword).toEqual([[utcMidnight, utcMidnight]]);
    expect(fromRoute.page).toEqual([[utcMidnight, utcMidnight]]);
    expect(fromWorker).toEqual(fromRoute);
  });
});

describe("POST /api/gsc/sync", () => {
  it("queues a sync job and answers 202 with its id", async () => {
    const res = await POST(syncRequest());
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job-1", status: "QUEUED" });
    expect(requestSiteJob).toHaveBeenCalledWith(db, { type: GSC_SYNC_JOB, siteId: "site-1", source: "manual" });
    expect(dispatchJob).toHaveBeenCalledWith(db, { id: "job-1", status: "QUEUED" });
    expect(fetchSearchAnalytics).not.toHaveBeenCalled();
  });

  it("says so when a sync is already queued or running", async () => {
    requestSiteJob.mockResolvedValueOnce({ job: { id: "job-0", status: "RUNNING" }, created: false });
    const res = await POST(syncRequest());
    expect(await res.json()).toEqual({ jobId: "job-0", status: "RUNNING", alreadyActive: true });
  });

  it("still rejects a site owned by someone else without queueing", async () => {
    db.site.findUnique.mockResolvedValue({ userId: "someone-else", gscProperty: "sc-domain:quilltab.app" });

    const res = await POST(syncRequest());

    expect(res.status).toBe(404);
    expect(requestSiteJob).not.toHaveBeenCalled();
  });

  it("answers 400 for a site without a GSC property", async () => {
    db.site.findUnique.mockResolvedValue({ userId: "user-1", gscProperty: null });
    expect((await POST(syncRequest())).status).toBe(400);
    expect(requestSiteJob).not.toHaveBeenCalled();
  });
});

describe("gsc-sync job", () => {
  it("keeps the old response shape as its result", async () => {
    expect(await runSyncJob()).toEqual({
      keywordsInserted: 1,
      pagesInserted: 1,
      startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("fails an expired Google token permanently with REAUTH_REQUIRED", async () => {
    fetchSearchAnalytics.mockRejectedValue(new FakeReauthError());

    const err = await runSyncJob().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobError);
    expect(err).toMatchObject({ code: "REAUTH_REQUIRED", permanent: true });
    expect(getJobHandler(GSC_SYNC_JOB)!.isPermanent(err)).toBe(true);
  });

  it("lets a network error retry", async () => {
    fetchSearchAnalytics.mockRejectedValue(new Error("socket hang up"));
    const err = await runSyncJob().catch((e: unknown) => e);
    expect(getJobHandler(GSC_SYNC_JOB)!.isPermanent(err)).toBe(false);
  });

  it("queues an alert evaluation once it succeeded", () => {
    expect(getJobHandler(GSC_SYNC_JOB)!.followUps?.({} as Job)).toEqual(["alerts-evaluate"]);
  });
});
