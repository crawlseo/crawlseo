import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ authenticated: true, findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: async () =>
    state.authenticated
      ? {
          user: {
            id: "current-user",
            name: "Test User",
            email: "user@example.test",
          },
        }
      : null,
}));
vi.mock("@/lib/db", () => ({ db: { apiKey: { findMany: state.findMany } } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
import GlobalSettingsPage from "./page";

describe("global settings", () => {
  beforeEach(() => {
    state.authenticated = true;
    state.findMany
      .mockReset()
      .mockResolvedValue([
        { provider: "bing", updatedAt: new Date("2026-01-01") },
      ]);
  });
  it("loads only the current user's integration metadata without requiring a site", async () => {
    const html = renderToStaticMarkup(await GlobalSettingsPage());
    expect(state.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "current-user" },
      select: { provider: true, updatedAt: true },
    });
    for (const text of [
      "Global settings",
      "Appearance",
      "Language",
      "External API keys",
      "Bing Webmaster Tools",
      "Test User",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Delete site");
  });
  it("redirects signed-out visitors before accessing integrations", async () => {
    state.authenticated = false;
    await expect(GlobalSettingsPage()).rejects.toThrow("redirect:/login");
    expect(state.findMany).not.toHaveBeenCalled();
  });
});
