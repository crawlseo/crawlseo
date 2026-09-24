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

import { POST } from "./route";
import { syncGSCDataForSite } from "@/lib/workers/gsc-sync";

const GSC_DAY = "2026-09-14";
const keywordRow = {
  query: "crm for startups",
  page: "https://acme.com/crm",
  date: GSC_DAY,
  device: "MOBILE",
  country: "usa",
  clicks: 7,
  impressions: 120,
  ctr: 0.058,
  position: 4.2,
};
const pageRow = {
  page: "https://acme.com/crm",
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
  db.site.findUnique.mockResolvedValue({ userId: "user-1", gscProperty: "sc-domain:acme.com" });
  fetchSearchAnalytics.mockResolvedValue([keywordRow]);
  fetchPageAnalytics.mockResolvedValue([pageRow]);
});

afterAll(() => {
  process.env.TZ = originalTZ;
});

describe.each(["Europe/Madrid", "America/New_York"])("GSC sync under TZ=%s", (tz) => {
  it("route and worker write the same date for the same GSC row", async () => {
    process.env.TZ = tz;

    const res = await POST(syncRequest());
    expect(res.status).toBe(200);
    const fromRoute = writtenDates();

    vi.clearAllMocks();
    db.site.findUnique.mockResolvedValue({ userId: "user-1", gscProperty: "sc-domain:acme.com" });
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
  it("keeps its response shape", async () => {
    const res = await POST(syncRequest());

    expect(await res.json()).toEqual({ success: true, keywordsInserted: 1, pagesInserted: 1 });
  });

  it("still rejects a site owned by someone else without fetching", async () => {
    db.site.findUnique.mockResolvedValue({ userId: "someone-else", gscProperty: "sc-domain:acme.com" });

    const res = await POST(syncRequest());

    expect(res.status).toBe(404);
    expect(fetchSearchAnalytics).not.toHaveBeenCalled();
  });

  it("still maps an expired Google token to 401 REAUTH_REQUIRED", async () => {
    fetchSearchAnalytics.mockRejectedValue(new FakeReauthError());

    const res = await POST(syncRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "REAUTH_REQUIRED" });
  });
});
