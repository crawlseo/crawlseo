"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CrawlFailedNotice } from "./crawl-failed-notice";

interface CrawlStatusPollerProps {
  siteId: string;
  crawlId: string;
}

interface CrawlStatus {
  id: string;
  status: string;
  pagesFound: number;
  issuesFound: number;
  healthScore: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

const isDone = (s: CrawlStatus | null) => s?.status === "COMPLETED" || s?.status === "FAILED";

export function CrawlStatusPoller({ siteId, crawlId }: CrawlStatusPollerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<CrawlStatus | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/sites/${siteId}/crawl/${crawlId}/status`);
      if (!res.ok) return;
      const data = (await res.json()) as CrawlStatus;
      setStatus(data);
      if (isDone(data)) router.refresh();
    } catch {
      // ignore
    }
  }, [siteId, crawlId, router]);

  const done = isDone(status);

  useEffect(() => {
    // Stop once the crawl has finished or failed (the status endpoint marks a
    // crawl whose process died as FAILED, #57).
    if (done) return;
    // First poll right away (from a timer, so no state is set during the effect), then every 3 s.
    const first = setTimeout(poll, 0);
    const interval = setInterval(poll, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [poll, done]);

  if (status?.status === "FAILED") {
    return <CrawlFailedNotice error={status.error} finishedAt={status.finishedAt} />;
  }
  if (done) return null;

  return (
    <div role="status"
      className="mb-6 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-4">
      <Loader2 className="size-5 animate-spin text-brand-500" aria-hidden />
      <div>
        <p className="text-sm font-medium text-text-strong">
          Crawl in progress…
        </p>
        <p className="text-xs text-muted-foreground">
          {status?.pagesFound ?? 0} pages found · {status?.issuesFound ?? 0} issues
        </p>
      </div>
    </div>
  );
}
