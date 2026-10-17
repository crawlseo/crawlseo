import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, PrismaClient } from "@prisma/client";

const sync = vi.hoisted(() => vi.fn());
const { requestSiteJob, dispatchJob } = vi.hoisted(() => ({
  requestSiteJob: vi.fn(async () => ({ job: { id: "job-1", status: "QUEUED" }, created: true })),
  dispatchJob: vi.fn(),
}));
const db = vi.hoisted(() => ({ site: { findUnique: vi.fn(async () => ({ id: "site-1", userId: "user-1" })) } }));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/workers/vitals-sync", () => ({ syncVitalsForSite: sync }));
vi.mock("@/lib/jobs/site-jobs", () => ({ requestSiteJob }));
vi.mock("@/lib/jobs/dispatch", () => ({ dispatchJob }));

import { POST } from "./route";
import { getJobHandler, VITALS_JOB } from "@/lib/jobs/handlers";

const params = { params: Promise.resolve({ siteId: "site-1" }) };

function runVitalsJob() {
  const job = { id: "job-1", siteId: "site-1", type: VITALS_JOB, attempts: 1, maxAttempts: 2 } as Job;
  return getJobHandler(VITALS_JOB)!.run({
    db: db as unknown as PrismaClient,
    job,
    workerId: "test",
    signal: new AbortController().signal,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/sites/[siteId]/vitals", () => {
  it("queues a vitals job and answers 202 with its id", async () => {
    const res = await POST(new Request("http://x"), params);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job-1", status: "QUEUED" });
    expect(requestSiteJob).toHaveBeenCalledWith(db, { type: VITALS_JOB, siteId: "site-1", source: "manual" });
    expect(dispatchJob).toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it("answers 404 for another user's site", async () => {
    db.site.findUnique.mockResolvedValueOnce({ id: "site-1", userId: "user-2" });
    expect((await POST(new Request("http://x"), params)).status).toBe(404);
    expect(requestSiteJob).not.toHaveBeenCalled();
  });
});

describe("vitals job", () => {
  it("fails an exhausted quota permanently, with a code the UI can map", async () => {
    sync.mockResolvedValueOnce({
      inserted: 0,
      results: [{ url: "https://example.com", error: "PageSpeed Insights quota exhausted" }],
      error: "PageSpeed Insights quota exhausted",
      errorCode: "QUOTA_EXCEEDED",
    });

    const err = await runVitalsJob().catch((e: unknown) => e);
    expect(err).toMatchObject({ message: "PageSpeed Insights quota exhausted", code: "QUOTA_EXCEEDED" });
    expect(getJobHandler(VITALS_JOB)!.isPermanent(err)).toBe(true);
  });

  it("lets other total failures retry", async () => {
    sync.mockResolvedValueOnce({
      inserted: 0,
      results: [],
      error: "PageSpeed Insights request failed (HTTP 500)",
      errorCode: undefined,
    });

    const err = await runVitalsJob().catch((e: unknown) => e);
    expect(err).toMatchObject({ message: "PageSpeed Insights request failed (HTTP 500)" });
    expect(getJobHandler(VITALS_JOB)!.isPermanent(err)).toBe(false);
  });

  it("returns what it saved", async () => {
    sync.mockResolvedValueOnce({ inserted: 2, results: [{ url: "https://example.com", perfScore: 90 }] });
    expect(await runVitalsJob()).toEqual({ inserted: 2, results: [{ url: "https://example.com", perfScore: 90 }] });
    expect(sync).toHaveBeenCalledWith("user-1", "site-1", 5);
  });
});
