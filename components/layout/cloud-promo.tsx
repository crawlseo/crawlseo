"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "crawlseo-cloud-promo-hidden";
const CLOUD_URL = "https://crawlseo.cloud/?utm_source=oss&utm_medium=app&utm_campaign=sidebar";

/**
 * One card in the sidebar pointing to the hosted AI visibility product,
 * styled as the ink CTA card of crawlseo.cloud. A plain link: no request,
 * no image and no tracking leaves the app. Hidden for good with
 * CRAWLSEO_HIDE_CLOUD_PROMO=true (the server leaves it out), or per browser
 * with the Hide button (remembered in localStorage).
 */
const HIDE_EVENT = "crawlseo-cloud-promo-hidden";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(HIDE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(HIDE_EVENT, onChange);
  };
}

function storedHidden() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Storage blocked: show the card; Hide still works for this page view.
    return false;
  }
}

export function CloudPromo() {
  // The server renders nothing (snapshot true) and the browser decides after
  // reading storage, so a dismissed card never flashes.
  const stored = useSyncExternalStore(subscribe, storedHidden, () => true);
  const [hiddenNow, setHiddenNow] = useState(false);
  const hidden = stored || hiddenNow;

  function hide() {
    setHiddenNow(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
      window.dispatchEvent(new Event(HIDE_EVENT));
    } catch {
      // Not remembered when storage is blocked; hidden until the next load.
    }
  }

  if (hidden) return null;

  return (
    <aside
      aria-label="crawlseo cloud"
      className="relative flex flex-col gap-2 rounded-xl bg-ink p-4 text-ink-text [&_:focus-visible]:outline-brand-400"
    >
      {/* Eyebrow in brand 400: 7.19:1 on ink */}
      <div className="flex items-center gap-2 pr-8">
        <span className="mono-label text-[11px] leading-4 whitespace-nowrap text-brand-400">AI visibility</span>
        <span className="mono-label rounded-sm border border-brand-400 px-1.5 text-[11px] leading-4 text-brand-400">
          Cloud
        </span>
      </div>
      {/* The home page headline of crawlseo.cloud */}
      <p className="text-[14px] leading-5 text-ink-lead">
        See what AI assistants say about your website.
      </p>
      <a
        href={CLOUD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ size: "sm" }), "mt-1 h-9 w-full")}
      >
        See crawlseo.cloud{" "}↗
      </a>
      <button
        type="button"
        aria-label="Hide"
        onClick={hide}
        className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-xl text-ink-text/70 transition-colors hover:text-ink-text"
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  );
}
