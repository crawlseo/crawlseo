import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("@/lib/auth", () => ({
  auth: async () => (state.authenticated ? { user: { id: "user-1" } } : null),
}));
import { POST } from "./route";

describe("appearance preference", () => {
  beforeEach(() => {
    state.authenticated = true;
  });
  const request = (body: string, protocol = "https") =>
    new Request(`${protocol}://example.test/api/user/appearance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

  it.each(["light", "dark", "system"])(
    "persists %s across all paths",
    async (theme) => {
      const response = await POST(request(JSON.stringify({ theme })));
      expect(await response.json()).toEqual({ theme });
      const cookie = response.headers.get("set-cookie");
      for (const attribute of [
        `crawlseo-theme=${theme}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=lax",
        "Max-Age=31536000",
      ])
        expect(cookie).toContain(attribute);
    },
  );

  it.each([
    "null",
    "{}",
    '{"theme":"constructor"}',
    '{"theme":true}',
    '{"theme":"auto"}',
    "invalid JSON",
  ])("rejects %s without changing preferences", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("requires a signed-in user", async () => {
    state.authenticated = false;
    const response = await POST(request('{"theme":"dark"}'));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("supports local HTTP development", async () => {
    const response = await POST(request('{"theme":"system"}', "http"));
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
});
