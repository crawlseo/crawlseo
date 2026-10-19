import { beforeEach, describe, expect, it, vi } from "vitest";

// Send test: the form's URL and secret, or the saved ones when the form leaves
// them empty; the answer of the one attempt comes back as is.

const { sendWebhook, saved } = vi.hoisted(() => ({
  sendWebhook: vi.fn(),
  saved: { webhook: null as { url: string; secret: string } | null },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/user-settings", () => ({ getWebhook: vi.fn(async () => saved.webhook) }));
vi.mock("@/lib/webhooks/deliver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webhooks/deliver")>()),
  sendWebhook,
}));

import { POST } from "./route";

const post = (body: object) => POST(new Request("http://localhost/api/user/webhook/test", { method: "POST", body: JSON.stringify(body) }));
const SECRET = "0123456789abcdef0123";

beforeEach(() => {
  saved.webhook = null;
  sendWebhook.mockReset();
  sendWebhook.mockResolvedValue({ ok: true, status: 200 });
});

describe("POST /api/user/webhook/test", () => {
  it("sends a test event with the form's values", async () => {
    const res = await post({ url: "https://hooks.quilltab.app/in", secret: SECRET });
    expect(await res.json()).toEqual({ ok: true, status: 200 });
    expect(sendWebhook).toHaveBeenCalledWith("https://hooks.quilltab.app/in", SECRET, "test", expect.objectContaining({ event: "test" }));
  });

  it("uses the saved secret when the form has only a URL", async () => {
    saved.webhook = { url: "https://hooks.quilltab.app/old", secret: SECRET };
    await post({ url: "https://hooks.quilltab.app/new" });
    expect(sendWebhook).toHaveBeenCalledWith("https://hooks.quilltab.app/new", SECRET, "test", expect.anything());
  });

  it("says what the webhook answered when it failed", async () => {
    sendWebhook.mockResolvedValue({ ok: false, status: 500, error: "The webhook answered HTTP 500.", retryable: true });
    expect(await (await post({ url: "https://hooks.quilltab.app/in", secret: SECRET })).json()).toEqual({
      ok: false,
      status: 500,
      error: "The webhook answered HTTP 500.",
    });
  });

  it("needs a URL and a secret from the form or saved", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ url: "https://hooks.quilltab.app/in" })).status).toBe(400);
    expect(sendWebhook).not.toHaveBeenCalled();
  });
});
