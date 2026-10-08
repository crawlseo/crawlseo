"use client";

import { AlertTriangle } from "lucide-react";
import { useT } from "@/components/i18n/provider";

/** The last crawl attempt failed: why, and when. */
export function CrawlFailedNotice({
  error,
  finishedAt,
}: {
  error: string | null;
  finishedAt: Date | string | null;
}) {
  const t = useT();
  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-xl border border-danger/40 bg-danger-bg px-5 py-4"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
      <div>
        <p className="text-sm font-medium text-text-strong">
          {t("Last crawl failed")}
          {finishedAt ? ` · ${t.date(finishedAt, { time: true })}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {t.stored(error ?? "No reason was recorded.")} {t("Run a new crawl to try again.")}{" "}
        </p>
      </div>
    </div>
  );
}
