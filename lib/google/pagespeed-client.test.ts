import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { apiKey: { findUnique: async () => null } } }));
vi.mock("@/lib/encryption", () => ({ decrypt: (s: string) => s }));

import { fetchPageSpeed, PageSpeedError } from "./pagespeed-client";

const GOOGLE_429 = JSON.stringify({
  error: {
    code: 429,
    message:
      "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'pagespeedonline.googleapis.com'",
    status: "RESOURCE_EXHAUSTED",
  },
});

function stubResponse(status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status, statusText: "Too Many Requests" }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchPageSpeed errors", () => {
  it("turns a 429 into a clean quota error and logs Google's body server-side", async () => {
    stubResponse(429, GOOGLE_429);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const err = await fetchPageSpeed("https://example.com/").catch((e) => e);

    expect(err).toBeInstanceOf(PageSpeedError);
    expect(err.code).toBe("QUOTA_EXCEEDED");
    expect(err.message).not.toMatch(/[{}]|RESOURCE_EXHAUSTED|googleapis/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("429"), GOOGLE_429);
  });

  it("recognises a quota body even without a 429 status", async () => {
    stubResponse(403, GOOGLE_429);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const err = await fetchPageSpeed("https://example.com/").catch((e) => e);
    expect(err.code).toBe("QUOTA_EXCEEDED");
  });

  it("keeps other failures generic, without the raw body", async () => {
    stubResponse(500, '{"error":{"message":"Lighthouse returned error: FAILED_DOCUMENT_REQUEST"}}');
    vi.spyOn(console, "error").mockImplementation(() => {});

    const err = await fetchPageSpeed("https://example.com/").catch((e) => e);
    expect(err.code).toBe("REQUEST_FAILED");
    expect(err.message).toBe("PageSpeed Insights request failed (HTTP 500)");
  });
});
