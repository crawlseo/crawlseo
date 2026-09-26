import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "@/lib/encryption";

const { db, tx } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    bingDaily: { upsert: vi.fn(async () => ({})) },
    bingSearchWeekly: { upsert: vi.fn(async () => ({})) },
  };
  return {
    tx,
    db: {
      site: { findUnique: vi.fn() },
      apiKey: { findUnique: vi.fn() },
      $transaction: vi.fn(async (run: (t: typeof tx) => Promise<unknown>) => run(tx)),
    },
  };
});

vi.mock("@/lib/db", () => ({ db }));
// The fetchers are the network; the key lookup stays real.
vi.mock("@/lib/bing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bing")>()),
  fetchBingTraffic: async () => [{ date: "2026-08-01", clicks: 1, impressions: null }],
  fetchBingSearchStats: async () => [],
  fetchBingCrawlStats: async () => [],
}));

import { syncBingDataForSite } from "./bing-sync";

const site = { userId: "user-1", bingSite: "https://a.example/" };

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
});

beforeEach(() => {
  vi.clearAllMocks();
  db.site.findUnique.mockResolvedValue(site);
  db.apiKey.findUnique.mockResolvedValue({
    encryptedLogin: null,
    encryptedPassword: encrypt("key"),
  });
  tx.$queryRaw.mockResolvedValue([{ bingSite: site.bingSite }]);
});

describe("syncBingDataForSite", () => {
  it("names the missing key instead of a generic endpoint failure", async () => {
    db.apiKey.findUnique.mockResolvedValue(null);
    const result = await syncBingDataForSite("user-1", "site-a");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/API key/);
  });

  it("writes while holding the Site row and keeps an absent counter null", async () => {
    const result = await syncBingDataForSite("user-1", "site-a");

    expect(result).toMatchObject({ success: true, daysUpserted: 1 });
    // The lock is what makes a concurrent property change wait for these
    // writes, so its wipe sees them (see the PUT route and the key DELETE).
    const [sql] = tx.$queryRaw.mock.calls[0];
    expect(sql.join("?")).toMatch(/FOR UPDATE/);
    expect(tx.bingDaily.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { clicks: 1, impressions: null } })
    );
  });

  it("writes nothing when the property changed while the fetches ran", async () => {
    tx.$queryRaw.mockResolvedValue([{ bingSite: "https://b.example/" }]);
    const result = await syncBingDataForSite("user-1", "site-a");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/changed/);
    expect(tx.bingDaily.upsert).not.toHaveBeenCalled();
  });
});
