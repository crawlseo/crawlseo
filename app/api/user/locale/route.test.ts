import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("@/lib/auth", () => ({
  auth: async () => (state.authenticated ? { user: { id: "user-1" } } : null),
}));
import { POST } from "./route";

describe("language preference", () => {
  beforeEach(() => {
    state.authenticated = true;
  });
  const request = (body: string) =>
    new Request("https://example.test/api/user/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  it("persists a registered language for all paths using a protected cookie", async () => {
    const response = await POST(request(JSON.stringify({ locale: "de" })));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("crawlseo-locale=de");
    for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=lax", "Max-Age=31536000"])
      expect(cookie).toContain(attribute);
  });
  it("switches back to English", async () => {
    const response = await POST(request(JSON.stringify({ locale: "en" })));
    expect(response.headers.get("set-cookie")).toContain("crawlseo-locale=en");
  });
  it.each(["null", "{}", '{"locale":"constructor"}', '{"locale":"fr"}', "invalid JSON"])(
    "rejects invalid input %s without setting a cookie",
    async (body) => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );
  it("requires a signed-in user", async () => {
    state.authenticated = false;
    const response = await POST(request('{"locale":"de"}'));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
