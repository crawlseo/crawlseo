import { beforeEach, describe, expect, it, vi } from "vitest";

// TEST on a connected row checks the key already saved for the session user. The key is decrypted on the
// server and never sent back: the response is only { success }.

const { db, testBingKey, testConnection } = vi.hoisted(() => ({
  db: { apiKey: { findUnique: vi.fn() } },
  testBingKey: vi.fn(async () => true),
  testConnection: vi.fn(async () => true),
}));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v.replace(/^enc:/, "") }));
vi.mock("@/lib/bing", () => ({ testBingKey }));
vi.mock("@/lib/dataforseo/client", () => ({ testConnection }));

import { POST } from "./route";

const post = (body: object) =>
  POST(new Request("http://localhost/api/user/api-keys/test", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("testing the saved key", () => {
  it("tests the saved Bing key of the session user and returns only the result", async () => {
    db.apiKey.findUnique.mockResolvedValue({ encryptedLogin: null, encryptedPassword: "enc:bing-secret" });
    const res = await post({ provider: "bing", saved: true });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ success: true });
    expect(text).not.toContain("bing-secret");
    expect(testBingKey).toHaveBeenCalledWith("bing-secret");
    expect(db.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_provider: { userId: "user-1", provider: "bing" } } })
    );
  });

  it("tests the saved DataForSEO login and password", async () => {
    db.apiKey.findUnique.mockResolvedValue({ encryptedLogin: "enc:me@x.test", encryptedPassword: "enc:pw" });
    testConnection.mockResolvedValueOnce(false);
    const res = await post({ provider: "dataforseo", saved: true });
    expect(await res.json()).toEqual({ success: false });
    expect(testConnection).toHaveBeenCalledWith("me@x.test", "pw");
  });

  it("answers 404 when nothing is saved, and 400 for a provider without a test", async () => {
    db.apiKey.findUnique.mockResolvedValue(null);
    expect((await post({ provider: "bing", saved: true })).status).toBe(404);
    expect((await post({ provider: "google_pagespeed", saved: true })).status).toBe(400);
    expect(testBingKey).not.toHaveBeenCalled();
  });

  it("reports a saved key that can no longer be decrypted as a failed test", async () => {
    db.apiKey.findUnique.mockResolvedValue({ encryptedLogin: null, encryptedPassword: 42 });
    const res = await post({ provider: "bing", saved: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: false });
    expect(testBingKey).not.toHaveBeenCalled();
  });

  it("fails a saved DataForSEO row without a login without calling the service", async () => {
    db.apiKey.findUnique.mockResolvedValue({ encryptedLogin: null, encryptedPassword: "enc:pw" });
    expect(await (await post({ provider: "dataforseo", saved: true })).json()).toEqual({ success: false });
    expect(testConnection).not.toHaveBeenCalled();
  });
});

describe("testing typed credentials (unchanged)", () => {
  it("tests a typed Bing key without reading the database", async () => {
    expect(await (await post({ provider: "bing", apiKey: "typed" })).json()).toEqual({ success: true });
    expect(testBingKey).toHaveBeenCalledWith("typed");
    expect(db.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("tests a typed DataForSEO login and password", async () => {
    await post({ provider: "dataforseo", login: "me@x.test", password: "pw" });
    expect(testConnection).toHaveBeenCalledWith("me@x.test", "pw");
  });

  it("answers 400 for missing typed credentials or a provider without a test", async () => {
    expect((await post({ provider: "bing" })).status).toBe(400);
    expect((await post({ provider: "dataforseo", login: "me@x.test" })).status).toBe(400);
    expect((await post({ provider: "google_pagespeed", apiKey: "k" })).status).toBe(400);
    expect(testBingKey).not.toHaveBeenCalled();
    expect(testConnection).not.toHaveBeenCalled();
  });
});
