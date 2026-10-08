"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/provider";

const STORAGE_KEY = "crawlseo-cloud-promo-hidden";
const CLOUD_URL =
  "https://crawlseo.cloud/?utm_source=oss&utm_medium=app&utm_campaign=sidebar";

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
  const t = useT();
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
      className="relative flex min-w-0 flex-col gap-2.5 rounded-xl bg-ink p-3 text-ink-text [&_:focus-visible]:outline-brand-400"
    >
      {/* Eyebrow in brand 400: 7.19:1 on ink */}
      <div className="flex min-h-5 items-center pr-8">
        <span className="mono-label max-w-full rounded-sm border border-brand-400 px-1.5 text-[10px] leading-4 break-words text-brand-400">
          {t("Cloud")}
        </span>
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="text-[14px] font-semibold leading-5 break-words">
          {t("AI visibility")}
        </p>
        <p className="text-[13px] leading-5 break-words text-ink-lead">
          {t("See what AI assistants say about your website.")}
        </p>
      </div>
      <a
        href={CLOUD_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("Explore crawlseo.cloud")}
        className={cn(
          buttonVariants({ size: "sm" }),
          "mt-1 h-auto min-h-10 w-full min-w-0 justify-between gap-2 px-2.5 py-2 font-sans text-[13px] normal-case tracking-normal whitespace-normal",
        )}
      >
        <span className="min-w-0 break-words">{t("Explore cloud")}</span>
        <ArrowUpRight className="size-4 shrink-0" aria-hidden />
      </a>
      <button
        type="button"
        aria-label={t("Hide")}
        onClick={hide}
        className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-xl text-ink-text/70 transition-colors hover:text-ink-text"
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  );
}
