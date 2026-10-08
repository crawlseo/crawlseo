"use client";

import { useCallback, useSyncExternalStore } from "react";

export const SIDEBAR_COLLAPSED = "crawlseo-sidebar-collapsed";
export const CLOUD_PROMO_HIDDEN = "crawlseo-cloud-promo-hidden";
type Preference = typeof SIDEBAR_COLLAPSED | typeof CLOUD_PROMO_HIDDEN;
const temporaryValues = new Map<Preference, boolean>();

export function readPreference(key: Preference): boolean {
  if (temporaryValues.has(key)) return temporaryValues.get(key)!;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function setPreference(key: Preference, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
    temporaryValues.delete(key);
  } catch {
    // Blocked storage still permits changes for the current page session.
    temporaryValues.set(key, value);
  }
  window.dispatchEvent(new Event(key));
}

export function useBrowserPreference(key: Preference, serverValue = false) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) {
          temporaryValues.delete(key);
          onChange();
        }
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(key, onChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(key, onChange);
      };
    },
    [key],
  );
  return useSyncExternalStore(
    subscribe,
    () => readPreference(key),
    () => serverValue,
  );
}
