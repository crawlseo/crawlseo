"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useHeaderStatus } from "@/components/ui/header-status";
import { formatDay } from "@/lib/format";
import { pendingNote, waitForJob, type JobView } from "@/lib/jobs/client";
import { cn } from "@/lib/utils";

export type SyncOutcome =
  | { tone: "success" | "empty" | "error"; text: string }
  | { tone: "reauth"; text: string }
  | { tone: "waiting"; text: string };

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

/** The outcome of a finished sync job, in the same terms as the old synchronous response. */
export function syncJobOutcome(job: JobView): SyncOutcome {
  // An attempt failed and nothing will start the next one by itself.
  if (job.waiting) return { tone: "waiting", text: pendingNote(job) ?? "Sync failed, retry now." };
  if (job.status === "SUCCEEDED") return syncOutcome(200, (job.result ?? {}) as SyncResponse);
  if (job.errorCode === "REAUTH_REQUIRED") return syncOutcome(401, { code: "REAUTH_REQUIRED" });
  return syncOutcome(500, { error: job.lastError ?? undefined });
}

const TONE: Record<SyncOutcome["tone"], string> = {
  success: "text-success",
  empty: "text-muted-foreground",
  error: "text-danger",
  reauth: "text-warning",
  waiting: "text-warning",
};

/**
 * Sync GSC with its result in a fixed slot, so a message never moves the
 * button or the layout around it. In a page header the message goes to the
 * header's status row (PageHeader reserveStatus keeps that row's height); on a
 * card it sits after the button (three lines, reserved).
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
  const setHeaderStatus = useHeaderStatus();
  const [loading, setLoading] = useState<false | "queued" | "running">(false);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);

  const handleSync = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await runSync();
  };

  const runSync = async () => {
    setLoading("queued");
    setOutcome(null);

    try {
      const response = await fetch("/api/gsc/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = (await response.json().catch(() => ({}))) as SyncResponse & { jobId?: string };
      let next: SyncOutcome;
      if (response.status === 202 && data.jobId) {
        // Queued: wait for the job, and say why when it waits or retries.
        const job = await waitForJob(data.jobId, {
          onUpdate: (j) => {
            setLoading(j.status === "RUNNING" ? "running" : "queued");
            const note = pendingNote(j);
            setOutcome(note ? { tone: "empty", text: note } : null);
          },
        });
        next = syncJobOutcome(job);
      } else {
        next = syncOutcome(response.status, data);
      }
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

  const message = outcome && (
    <>
      {outcome.text}
      {outcome.tone === "waiting" && (
        <>
          {" "}
          <button type="button" onClick={() => void runSync()} className="text-link font-medium">
            Retry
          </button>
        </>
      )}
      {outcome.tone === "reauth" && (
        <>
          {" "}
          <button type="button" onClick={() => signIn("google")} className="text-link font-medium">
            Reconnect
          </button>
        </>
      )}
    </>
  );

  useEffect(() => {
    if (!setHeaderStatus) return;
    setHeaderStatus(
      outcome ? (
        <p
          role="status"
          title={outcome.text}
          className={cn("line-clamp-2 text-[12px] leading-4 sm:line-clamp-1", TONE[outcome.tone])}
        >
          {message}
        </p>
      ) : null
    );
    // message is derived from outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderStatus, outcome]);
  useEffect(() => () => setHeaderStatus?.(null), [setHeaderStatus]);

  const button = (
    <Button onClick={handleSync} disabled={loading !== false} variant={variant} size={size} className={className}>
      {loading === "queued" ? "Queued…" : loading ? "Syncing…" : "Sync GSC"}
    </Button>
  );

  if (setHeaderStatus) return button;

  return (
    <div
      className={cn(
        "flex min-w-0 gap-3",
        messageSide === "start" ? "flex-row-reverse items-center" : "flex-row items-start"
      )}
    >
      {button}
      <p
        role="status"
        title={outcome?.text}
        className={cn(
          "min-w-0 max-w-[340px] flex-1 text-[12px] leading-4",
          // Beside the button: two lines fit the 38px height. Card: three lines are always reserved under the top of the button.
          messageSide === "start" ? "line-clamp-2 text-right" : "line-clamp-3 h-12",
          outcome && TONE[outcome.tone]
        )}
      >
        {message}
      </p>
    </div>
  );
}
