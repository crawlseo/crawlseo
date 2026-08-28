import { beforeAll, describe, expect, it, vi } from "vitest";
import { encrypt } from "@/lib/encryption";

const db = vi.hoisted(() => ({
  site: { findUnique: vi.fn() },
  apiKey: { findUnique: vi.fn() },
  bingDaily: { upsert: vi.fn(async () => ({})) },
  bingSearchWeekly: { upsert: vi.fn(async () => ({})) },
}));

vi.mock("@/lib/db", () => ({ db }));
// The fetchers are the network; the key lookup stays real.
vi.mock("@/lib/bing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bing")>()),
  fetchBingTraffic: async () => [{ date: "2026-08-01", clicks: 1, impressions: 2 }],
  fetchBingSearchStats: async () => [],
  fetchBingCrawlStats: async () => [],
}));

import { syncBingDataForSite } from "./bing-sync";

const site = { userId: "user-1", bingSite: "https://a.example/" };

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
});

describe("syncBingDataForSite", () => {
  it("names the missing key instead of a generic endpoint failure", async () => {
    db.site.findUnique.mockResolvedValue(site);
    db.apiKey.findUnique.mockResolvedValue(null);
    const result = await syncBingDataForSite("user-1", "site-a");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/API key/);
  });

  it("writes nothing when the property changed while the fetches ran", async () => {
    db.apiKey.findUnique.mockResolvedValue({ encryptedLogin: encrypt("key") });
    db.site.findUnique
      .mockResolvedValueOnce(site)
      .mockResolvedValueOnce({ bingSite: "https://b.example/" });
    const result = await syncBingDataForSite("user-1", "site-a");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/changed/);
    expect(db.bingDaily.upsert).not.toHaveBeenCalled();
  });
});
