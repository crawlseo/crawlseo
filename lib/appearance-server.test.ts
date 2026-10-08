import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      key === "crawlseo-theme" && state.cookie != null
        ? { value: state.cookie }
        : undefined,
  }),
}));
import { getTheme } from "./appearance-server";

describe("server-rendered appearance", () => {
  it.each([undefined, "unregistered", "constructor", "Dark"])(
    "retains the light default for %s",
    async (value) => {
      state.cookie = value;
      expect(await getTheme()).toBe("light");
    },
  );
  it("uses the current request without leaking another browser's theme", async () => {
    for (const theme of ["dark", "light", "system", "light"]) {
      state.cookie = theme;
      expect(await getTheme()).toBe(theme);
    }
  });
});
