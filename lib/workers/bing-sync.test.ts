import { describe, expect, it, vi } from "vitest";

// With no key stored, every Bing endpoint would reject and the caller used to
// see "every Bing endpoint failed" instead of being told to add a key.

vi.mock("@/lib/db", () => ({
  db: {
    site: {
      findUnique: async () => ({ userId: "user-1", bingSite: "https://a.example/" }),
    },
    apiKey: { findUnique: async () => null },
  },
}));

import { syncBingDataForSite } from "./bing-sync";

describe("syncBingDataForSite", () => {
  it("names the missing key instead of a generic endpoint failure", async () => {
    const result = await syncBingDataForSite("user-1", "site-a");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/API key/);
  });
});
