import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ site: { findUnique: vi.fn() } }));
const sync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/workers/bing-sync", () => ({ syncBingDataForSite: sync }));

import { POST } from "./route";

const post = (siteId: string) =>
  POST(
    new Request("http://localhost/api/bing/sync", {
      method: "POST",
      body: JSON.stringify({ siteId }),
    })
  );

describe("POST /api/bing/sync", () => {
  // Like /api/gsc/sync: a site that does not exist and someone else's site get
  // the same 404, so the status does not reveal which ids exist.
  it("answers 404 for an unknown site and for another user's site", async () => {
    db.site.findUnique.mockResolvedValueOnce(null);
    expect((await post("nope")).status).toBe(404);

    db.site.findUnique.mockResolvedValueOnce({
      userId: "user-2",
      bingSite: "https://a.example/",
    });
    expect((await post("site-b")).status).toBe(404);

    expect(sync).not.toHaveBeenCalled();
  });

  it("answers 400 when the site has no Bing property", async () => {
    db.site.findUnique.mockResolvedValueOnce({ userId: "user-1", bingSite: null });
    expect((await post("site-a")).status).toBe(400);
    expect(sync).not.toHaveBeenCalled();
  });
});
