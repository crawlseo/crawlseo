import { beforeEach, describe, expect, it, vi } from "vitest";

// Saving a webhook: the URL passes the SSRF guard before it is stored, the
// secret is required the first time and kept when left empty later, and
// nothing is saved when webhooks are off on the server.

const { lookup, store } = vi.hoisted(() => ({
  lookup: vi.fn(),
  store: { webhook: null as { url: string; secret: string } | null },
}));
vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/user-settings", () => ({
  getWebhook: vi.fn(async () => store.webhook),
  saveWebhook: vi.fn(async (_db: unknown, _id: string, w: { url: string; secret: string }) => {
    store.webhook = w;
  }),
  removeWebhook: vi.fn(async () => {
    store.webhook = null;
  }),
}));
vi.mock("@/lib/webhooks/status", () => ({
  webhookStatus: vi.fn(async () => ({ enabled: true, allowPrivate: false, serverless: false, url: store.webhook?.url ?? null, lastDelivery: null })),
}));

import { DELETE, PUT } from "./route";

const put = (body: object) => PUT(new Request("http://localhost/api/user/webhook", { method: "PUT", body: JSON.stringify(body) }));
const SECRET = "0123456789abcdef0123";

beforeEach(() => {
  store.webhook = null;
  vi.unstubAllEnvs();
  lookup.mockReset();
  lookup.mockImplementation(async (name: string) =>
    name === "hooks.quilltab.app" ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "10.0.0.5", family: 4 }]
  );
});

describe("PUT /api/user/webhook", () => {
  it("saves a public URL with a secret", async () => {
    const res = await put({ url: "https://hooks.quilltab.app/in", secret: SECRET });
    expect(res.status).toBe(200);
    expect(store.webhook).toEqual({ url: "https://hooks.quilltab.app/in", secret: SECRET });
    expect(await res.json()).toMatchObject({ url: "https://hooks.quilltab.app/in" });
  });

  it("refuses a URL that resolves to a private address, and the cloud metadata address", async () => {
    for (const url of ["http://internal.quilltab.app/hook", "http://169.254.169.254/latest/meta-data", "http://127.0.0.1:3000/api"]) {
      lookup.mockImplementation(async (name: string) => [{ address: name.match(/^[\d.]+$/) ? name : "10.0.0.5", family: 4 }]);
      const res = await put({ url, secret: SECRET });
      expect(res.status, url).toBe(400);
      expect(await res.json()).toMatchObject({ field: "url" });
    }
    expect(store.webhook).toBeNull();
  });

  it("allows a private address only with ALERT_WEBHOOK_ALLOW_PRIVATE=true", async () => {
    vi.stubEnv("ALERT_WEBHOOK_ALLOW_PRIVATE", "true");
    expect((await put({ url: "http://n8n:5678/webhook/x", secret: SECRET })).status).toBe(200);
    lookup.mockImplementation(async () => [{ address: "169.254.169.254", family: 4 }]);
    expect((await put({ url: "http://metadata:80/", secret: SECRET })).status).toBe(400);
  });

  it("needs a secret the first time and keeps the saved one when left empty", async () => {
    const first = await put({ url: "https://hooks.quilltab.app/in" });
    expect(first.status).toBe(400);
    expect(await first.json()).toMatchObject({ field: "secret" });
    expect((await put({ url: "https://hooks.quilltab.app/in", secret: "too-short" })).status).toBe(400);

    await put({ url: "https://hooks.quilltab.app/in", secret: SECRET });
    expect((await put({ url: "https://hooks.quilltab.app/v2", secret: "" })).status).toBe(200);
    expect(store.webhook).toEqual({ url: "https://hooks.quilltab.app/v2", secret: SECRET });
  });

  it("saves nothing when webhooks are off on the server", async () => {
    vi.stubEnv("ALERT_WEBHOOKS_ENABLED", "false");
    expect((await put({ url: "https://hooks.quilltab.app/in", secret: SECRET })).status).toBe(403);
    expect(store.webhook).toBeNull();
  });

  it("DELETE removes it", async () => {
    store.webhook = { url: "https://hooks.quilltab.app/in", secret: SECRET };
    expect((await DELETE()).status).toBe(200);
    expect(store.webhook).toBeNull();
  });
});
