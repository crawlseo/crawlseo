import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { encrypt } from "@/lib/encryption";

const db = vi.hoisted(() => ({ apiKey: { findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { fetchBingCrawlStats, fetchBingTraffic, getBingApiKey } from "./bing-client";

function bingAnswers(rows: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ d: rows })))
  );
}

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getBingApiKey", () => {
  // Single-key providers keep the secret in encryptedPassword and leave
  // encryptedLogin null, the convention the PageSpeed key set.
  it("reads the key from encryptedPassword", async () => {
    db.apiKey.findUnique.mockResolvedValue({
      encryptedLogin: null,
      encryptedPassword: encrypt("bing-key"),
    });
    expect(await getBingApiKey("user-1")).toBe("bing-key");
  });
});

describe("a counter Bing leaves out of a row", () => {
  // Absent is not zero: the columns are nullable so "not measured" and
  // "measured zero" stay distinct.
  it("stays null in traffic rows", async () => {
    bingAnswers([{ Date: "/Date(1747983600000-0700)/", Clicks: 3 }]);
    expect(await fetchBingTraffic("k", "https://a.example/")).toEqual([
      { date: "2025-05-23", clicks: 3, impressions: null },
    ]);
  });

  it("stays null in crawl rows while a reported zero stays zero", async () => {
    bingAnswers([{ Date: "/Date(1747983600000-0700)/", CrawledPages: 0 }]);
    const [day] = await fetchBingCrawlStats("k", "https://a.example/");
    expect(day.crawledPages).toBe(0);
    expect(day.inIndex).toBeNull();
    expect(day.code5xx).toBeNull();
  });
});
