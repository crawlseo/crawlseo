import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.cookie == null ? undefined : { value: state.cookie } }) }));
import { getLocale, getMessages, getT } from "./server";

describe("request language", () => {
  beforeEach(() => { state.cookie = undefined; });
  it("defaults to English without a cookie", async () => {
    expect(await getLocale()).toBe("en");
    expect((await getT())("Settings")).toBe("Settings");
  });
  it("loads the selected catalog for server-rendered content", async () => {
    state.cookie = "de";
    expect(await getLocale()).toBe("de");
    expect((await getMessages("de")).Settings).toBe("Einstellungen");
    expect((await getT())("Settings")).toBe("Einstellungen");
  });
  it("cannot leak the previous request's language", async () => {
    state.cookie = "de";
    expect((await getT())("Settings")).toBe("Einstellungen");
    state.cookie = "en";
    expect((await getT())("Settings")).toBe("Settings");
    state.cookie = "unregistered";
    expect((await getT())("Settings")).toBe("Settings");
  });
});
