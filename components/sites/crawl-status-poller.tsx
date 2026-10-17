"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { fetchJob, isFinished, pendingNote, type JobView } from "@/lib/jobs/client";
import { CrawlFailedNotice } from "./crawl-failed-notice";

/**
 * A crawl job queued or running: its state, polled until it finished or
 * failed. `status` is what the server saw when it rendered the page.
 */
export function CrawlStatusPoller({ jobId, status }: { jobId: string; status: "QUEUED" | "RUNNING" }) {
  const router = useRouter();
  const [job, setJob] = useState<JobView | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await fetchJob(jobId);
      if (!data) return;
      setJob(data);
      if (isFinished(data)) router.refresh();
    } catch {
      // ignore
    }
  }, [jobId, router]);

  const done = job ? isFinished(job) : false;

  useEffect(() => {
    // Stop once the job has finished or failed (a job whose process died is
    // queued again or failed by recovery, #57).
    if (done) return;
    // First poll right away (from a timer, so no state is set during the effect), then every 3 s.
    const first = setTimeout(poll, 0);
    const interval = setInterval(poll, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [poll, done]);

  if (job?.status === "FAILED") {
    return (
      <CrawlFailedNotice
        error={job.crawl?.error ?? job.lastError}
        finishedAt={job.crawl?.finishedAt ?? job.finishedAt}
      />
    );
  }
  if (done) return null;

  const queued = (job?.status ?? status) === "QUEUED";
  const note = job && pendingNote(job);

  return (
    <div role="status"
      className="mb-6 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-4">
      <Loader2 className="size-5 animate-spin text-brand-500" aria-hidden />
      <div>
        <p className="text-sm font-medium text-text-strong">
          {queued ? "Crawl queued" : "Crawl in progress…"}
        </p>
        <p className="text-xs text-muted-foreground">
          {note ??
            (queued
              ? "It starts when the crawler is free."
              : `${job?.crawl?.pagesFound ?? 0} pages found · ${job?.crawl?.issuesFound ?? 0} issues`)}
        </p>
      </div>
    </div>
  );
}
