import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_PROMO_HIDDEN,
  SIDEBAR_COLLAPSED,
  readPreference,
  setPreference,
} from "./browser-preferences";

describe("shared browser preferences", () => {
  const values = new Map<string, string>();
  let events: EventTarget;
  beforeEach(() => {
    values.clear();
    events = new EventTarget();
    vi.stubGlobal(
      "window",
      Object.assign(events, {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => {
            values.set(key, value);
          },
        },
      }),
    );
    setPreference(CLOUD_PROMO_HIDDEN, false);
    setPreference(SIDEBAR_COLLAPSED, false);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("shares persisted choices and notifies other controls immediately", () => {
    const changed = vi.fn();
    events.addEventListener(CLOUD_PROMO_HIDDEN, changed);
    setPreference(CLOUD_PROMO_HIDDEN, true);
    expect(values.get(CLOUD_PROMO_HIDDEN)).toBe("true");
    expect(readPreference(CLOUD_PROMO_HIDDEN)).toBe(true);
    expect(readPreference(SIDEBAR_COLLAPSED)).toBe(false);
    expect(changed).toHaveBeenCalledOnce();
    setPreference(CLOUD_PROMO_HIDDEN, false);
    expect(readPreference(CLOUD_PROMO_HIDDEN)).toBe(false);
  });
  it("still permits hiding and restoring controls when storage is blocked", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setPreference(CLOUD_PROMO_HIDDEN, true);
    expect(readPreference(CLOUD_PROMO_HIDDEN)).toBe(true);
    setPreference(CLOUD_PROMO_HIDDEN, false);
    expect(readPreference(CLOUD_PROMO_HIDDEN)).toBe(false);
  });
});
