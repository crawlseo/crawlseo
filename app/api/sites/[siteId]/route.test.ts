import { describe, expect, it, vi } from "vitest";

// Changing the Bing property wipes the old property's rows. The wipe and the
// site update have to commit together, or a failed update (say a duplicate
// domain) leaves the old property with no history.

const db = vi.hoisted(() => ({
  site: {
    findUnique: vi.fn(async () => ({ userId: "user-1", bingSite: "https://old.example/" })),
    update: vi.fn(() => "update"),
  },
  bingSearchWeekly: { deleteMany: vi.fn(() => "delete-weekly") },
  bingDaily: { deleteMany: vi.fn(() => "delete-daily") },
  $transaction: vi.fn(async (ops: unknown[]) => ops.map(() => ({ id: "site-a" }))),
}));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db }));

import { PUT } from "./route";

function put(body: object) {
  return PUT(
    new Request("http://localhost/api/sites/site-a", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ siteId: "site-a" }) }
  );
}

describe("PUT /api/sites/[siteId] with a new Bing property", () => {
  it("wipes the old rows in the same transaction as the update", async () => {
    const res = await put({ bingSite: "https://new.example/" });
    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith([
      "delete-weekly",
      "delete-daily",
      "update",
    ]);
  });

  it("rejects a property that is not an http(s) URL", async () => {
    const res = await put({ bingSite: "ftp://new.example/" });
    expect(res.status).toBe(400);
  });
});
