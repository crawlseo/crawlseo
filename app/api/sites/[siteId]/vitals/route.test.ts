import { describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({
  db: { site: { findUnique: async () => ({ userId: "user-1" }) } },
}));
vi.mock("@/lib/workers/vitals-sync", () => ({ syncVitalsForSite: sync }));

import { POST } from "./route";

const params = { params: Promise.resolve({ siteId: "site-1" }) };

describe("POST /api/sites/[siteId]/vitals", () => {
  it("answers a quota failure with 429 and a code the UI can map", async () => {
    sync.mockResolvedValueOnce({
      inserted: 0,
      results: [{ url: "https://example.com", error: "PageSpeed Insights quota exhausted" }],
      error: "PageSpeed Insights quota exhausted",
      errorCode: "QUOTA_EXCEEDED",
    });

    const res = await POST(new Request("http://x"), params);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.code).toBe("QUOTA_EXCEEDED");
    expect(body.error).toBe("PageSpeed Insights quota exhausted");
  });

  it("keeps 502 for other total failures", async () => {
    sync.mockResolvedValueOnce({
      inserted: 0,
      results: [],
      error: "PageSpeed Insights request failed (HTTP 500)",
      errorCode: undefined,
    });

    const res = await POST(new Request("http://x"), params);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBeUndefined();
  });
});
