import { AlertTriangle } from "lucide-react";
import { formatDay } from "@/lib/format";

/** The last crawl attempt failed: why, and when. */
export function CrawlFailedNotice({
  error,
  finishedAt,
}: {
  error: string | null;
  finishedAt: Date | string | null;
}) {
  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-xl border border-danger/40 bg-danger-bg px-5 py-4"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
      <div>
        <p className="text-sm font-medium text-text-strong">
          Last crawl failed{finishedAt ? ` · ${formatDay(finishedAt, { time: true })}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {error ?? "No reason was recorded."} Run a new crawl to try again.
        </p>
      </div>
    </div>
  );
}
