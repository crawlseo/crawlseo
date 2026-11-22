import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./google-auth", () => ({ getAccessToken: async () => "token" }));

import { isUrlIndexed } from "./url-inspection-client";

function stubInspection(indexStatusResult: Record<string, string>) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ inspectionResult: { indexStatusResult } })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isUrlIndexed", () => {
  it("is true only when Google's verdict is PASS", async () => {
    for (const coverageState of ["Submitted and indexed", "Indexed, not submitted in sitemap"]) {
      stubInspection({ verdict: "PASS", coverageState });
      expect(await isUrlIndexed("u", "sc-domain:example.com", "https://example.com/"), coverageState).toBe(true);
    }
  });

  it("is false for excluded URLs, whatever the coverage text says", async () => {
    for (const coverageState of [
      "Crawled - not indexed",
      "Crawled - currently not indexed",
      "Submitted, but not indexed",
      "Discovered - currently not indexed",
      "Indexed",
    ]) {
      stubInspection({ verdict: "NEUTRAL", coverageState });
      expect(await isUrlIndexed("u", "sc-domain:example.com", "https://example.com/"), coverageState).toBe(false);
    }
  });

  it("is false when the inspection fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await isUrlIndexed("u", "sc-domain:example.com", "https://example.com/")).toBe(false);
  });
});
