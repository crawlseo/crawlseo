import { beforeEach, describe, expect, it, vi } from "vitest";

// The real DataForSEO `related_keywords/live` item shape puts keyword
// difficulty under keyword_data.keyword_properties.keyword_difficulty — NOT
// keyword_data.keyword_info.keyword_difficulty. This test pins that mapping.
const RAW_DFS_ITEM = {
  keyword_data: {
    keyword: "keyword research",
    keyword_info: {
      search_volume: 246000,
      cpc: 4.72,
      competition: 0.87,
      monthly_searches: [
        { year: 2026, month: 8, search_volume: 246000 },
        { year: 2026, month: 7, search_volume: 201000 },
      ],
      // NB: no keyword_difficulty here
    },
    keyword_properties: {
      keyword_difficulty: 88,
      detected_language: "en",
      se_type: "related_keywords",
    },
    serp_info: {},
  },
  keyword: "keyword research",
};

const RAW_RESPONSE = {
  status_code: 20000,
  status_message: "Ok.",
  tasks: [
    {
      result: [
        {
          items: [RAW_DFS_ITEM],
        },
      ],
    },
  ],
};

vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      findUnique: async () => ({
        encryptedLogin: "login",
        encryptedPassword: "password",
      }),
    },
  },
}));
vi.mock("@/lib/encryption", () => ({
  decrypt: (s: string) => s,
}));

import { keywordResearch } from "./client";

describe("keywordResearch difficulty path", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => RAW_RESPONSE,
      }))
    );
  });

  it("reads difficulty from keyword_properties, where DataForSEO returns it", async () => {
    const results = await keywordResearch("user-1", "keyword research");
    expect(results).not.toBeNull();
    expect(results?.[0].keyword).toBe("keyword research");
    expect(results?.[0].volume).toBe(246000);
    // The API sends difficulty under keyword_properties (88), not keyword_info
    expect(results?.[0].difficulty).toBe(88);
  });
});
