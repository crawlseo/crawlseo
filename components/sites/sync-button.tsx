"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SyncOutcome =
  | { tone: "success" | "empty" | "error"; text: string }
  | { tone: "reauth"; text: string };

type SyncResponse = {
  error?: string;
  code?: string;
  keywordsInserted?: number;
  pagesInserted?: number;
  startDate?: string;
  endDate?: string;
};

/** What a finished sync says. Zero keywords and zero pages is not a success: Search Console sent nothing. */
export function syncOutcome(status: number, data: SyncResponse): SyncOutcome {
  if (status === 401 && data.code === "REAUTH_REQUIRED") {
    return { tone: "reauth", text: "Your Google connection expired." };
  }
  if (status < 200 || status >= 300) {
    return { tone: "error", text: data.error || "Sync failed" };
  }
  const keywords = data.keywordsInserted ?? 0;
  const pages = data.pagesInserted ?? 0;
  if (keywords === 0 && pages === 0) {
    const range =
      data.startDate && data.endDate
        ? ` for ${formatDay(data.startDate, { year: true })} to ${formatDay(data.endDate, { year: true })}`
        : "";
    return { tone: "empty", text: `GSC returned no data${range}. Check the property in Site settings.` };
  }
  return { tone: "success", text: `Synced ${keywords} keywords · ${pages} pages` };
}

const TONE: Record<SyncOutcome["tone"], string> = {
  success: "text-success",
  empty: "text-muted-foreground",
  error: "text-danger",
  reauth: "text-warning",
};

/**
 * Sync GSC with its result in a fixed slot beside the button, so a message
 * never moves the button or the layout around it. In a page header the slot
 * sits before the button (two lines); on a card, after it (three lines,
 * reserved).
 */
export function SyncButton({
  siteId,
  className,
  variant = "default",
  size = "default",
  messageSide = "start",
}: {
  siteId: string;
  className?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm";
  messageSide?: "start" | "end";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);

  const handleSync = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);
    setOutcome(null);

    try {
      const response = await fetch("/api/gsc/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = (await response.json().catch(() => ({}))) as SyncResponse;
      const next = syncOutcome(response.status, data);
      setOutcome(next);

      if (next.tone === "success" || next.tone === "empty") router.refresh();
      // Only a plain success fades; an empty result or an error stays until the next sync.
      if (next.tone === "success") setTimeout(() => setOutcome(null), 4000);
    } catch {
      setOutcome({ tone: "error", text: "Sync failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "flex min-w-0 gap-3",
        messageSide === "start" ? "flex-row-reverse items-center" : "flex-row items-start"
      )}
    >
      <Button onClick={handleSync} disabled={loading} variant={variant} size={size} className={className}>
        {loading ? "Syncing…" : "Sync GSC"}
      </Button>
      <p
        role="status"
        title={outcome?.text}
        className={cn(
          "min-w-0 max-w-[340px] flex-1 text-[12px] leading-4",
          // Header: two lines fit beside the 38px button. Card: three lines are always reserved under the top of the button.
          messageSide === "start" ? "line-clamp-2 text-right" : "line-clamp-3 h-12",
          outcome && TONE[outcome.tone]
        )}
      >
        {outcome?.text}
        {outcome?.tone === "reauth" && (
          <>
            {" "}
            <button type="button" onClick={() => signIn("google")} className="text-link font-medium">
              Reconnect
            </button>
          </>
        )}
      </p>
    </div>
  );
}
