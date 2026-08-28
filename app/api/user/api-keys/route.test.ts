import { describe, expect, it, vi } from "vitest";

// The provider allow-list is a plain object: without hasOwn, "constructor" and
// "__proto__" pass as providers. Removing the Bing key also disconnects every
// property that key served.

const db = vi.hoisted(() => ({
  apiKey: {
    upsert: vi.fn(async () => ({ provider: "x", updatedAt: new Date() })),
    delete: vi.fn(() => "delete-key"),
  },
  site: { updateMany: vi.fn(() => "clear-properties") },
  bingSearchWeekly: { deleteMany: vi.fn(() => "delete-weekly") },
  bingDaily: { deleteMany: vi.fn(() => "delete-daily") },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/encryption", () => ({ encrypt: (v: string) => `enc:${v}` }));

import { DELETE, POST } from "./route";

const json = (method: string, body: object) =>
  new Request("http://localhost/api/user/api-keys", {
    method,
    body: JSON.stringify(body),
  });

describe("api-keys provider allow-list", () => {
  it("rejects Object.prototype names as providers", async () => {
    for (const provider of ["constructor", "__proto__", "toString"]) {
      expect((await POST(json("POST", { provider, login: "x" }))).status).toBe(400);
      expect((await DELETE(json("DELETE", { provider }))).status).toBe(400);
    }
    expect(db.apiKey.upsert).not.toHaveBeenCalled();
    expect(db.apiKey.delete).not.toHaveBeenCalled();
  });

  it("removing the Bing key disconnects its properties in one transaction", async () => {
    const res = await DELETE(json("DELETE", { provider: "bing" }));
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledWith([
      "delete-weekly",
      "delete-daily",
      "clear-properties",
      "delete-key",
    ]);
  });
});
