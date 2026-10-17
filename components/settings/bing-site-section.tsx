"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw, Save, XCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { pendingNote, waitForJob } from "@/lib/jobs/client";

interface BingSite {
  url: string;
}

export function BingSiteSection({
  siteId,
  bingSite,
}: {
  siteId: string;
  bingSite: string | null;
}) {
  const router = useRouter();
  const [sites, setSites] = useState<BingSite[]>([]);
  const [selected, setSelected] = useState(bingSite ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  async function loadSites() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/bing/sites");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Bing sites");
      setSites(data as BingSite[]);
      if (!data.length) setError("This Bing account has no verified sites.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Bing sites");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setError(null);
    setMessage(null);
    if (!selected) {
      setError("Choose a Bing property first.");
      return;
    }
    if (selected === bingSite) {
      setMessage("This property is already connected.");
      return;
    }
    setSaving(true);

    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bingSite: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setMessage("Bing property connected.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setMessage(null);
    setCanRetry(false);

    try {
      const res = await fetch("/api/bing/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const queued = await res.json();
      if (!res.ok) throw new Error(queued.error || "Sync failed");
      // The sync runs as a job: wait for it, and say why when it waits or retries.
      const job = await waitForJob(queued.jobId, {
        onUpdate: (j) => setMessage(pendingNote(j) ?? (j.status === "RUNNING" ? "Syncing…" : "Queued…")),
      });
      if (job.waiting) {
        setMessage(null);
        setError(pendingNote(job));
        setCanRetry(true);
        return;
      }
      if (job.status === "FAILED") throw new Error(job.lastError || "Sync failed");
      const data = (job.result ?? {}) as {
        daysUpserted?: number;
        queriesUpserted?: number;
        pagesUpserted?: number;
        partial?: string[];
      };
      setMessage(
        `Synced ${data.daysUpserted} days, ${data.queriesUpserted} query weeks, ` +
          `${data.pagesUpserted} page weeks.`
      );
      if (data.partial?.length) {
        setError(
          `Bing did not answer for: ${data.partial.join(", ")}. Run the sync again.`
        );
      }
      router.refresh();
    } catch (err) {
      setMessage(null);
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
            Bing Webmaster property
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Bing reports its own queries, pages and crawl stats. The property URL
            often differs from the Search Console one, so pick it explicitly.
          </p>
        </div>
        {bingSite ? (
          <span className="flex shrink-0 items-center gap-1.5 mono-label rounded-md border border-success/30 bg-success-bg px-2 py-0.5 text-[11px] text-success">
            <CheckCircle2 className="size-3.5" />
            Connected
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 mono-label rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            <XCircle className="size-3.5" />
            Not connected
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selected}
            onValueChange={(value) => setSelected(String(value))}
            onOpenChange={(open) => {
              if (open) void loadSites();
            }}
          >
            <SelectTrigger className="min-w-64">
              <SelectValue
                placeholder={loading ? "Loading…" : "Choose a Bing property"}
              />
            </SelectTrigger>
            <SelectContent>
              {sites.map((site) => (
                <SelectItem key={site.url} value={site.url}>
                  {site.url}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="button" size="sm" onClick={handleSave} disabled={saving || syncing}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="size-3.5" aria-hidden />
            )}
            Save
          </Button>

          {bingSite && (
            <Button type="button" size="sm" variant="outline" onClick={handleSync} disabled={syncing || saving}>
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              Sync Bing
            </Button>
          )}
        </div>

        {message && <p className="text-xs text-success">{message}</p>}
        {error && (
          <p className="text-xs text-danger">
            {error}
            {canRetry && (
              <>
                {" "}
                <button type="button" onClick={() => void handleSync()} className="text-link font-medium">
                  Retry
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
