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

interface BingSite {
  url: string;
  isVerified: boolean;
}

export function BingSiteSection({
  siteId,
  bingSite,
  keyConnected,
}: {
  siteId: string;
  bingSite: string | null;
  keyConnected: boolean;
}) {
  const router = useRouter();
  const [sites, setSites] = useState<BingSite[]>([]);
  const [selected, setSelected] = useState(bingSite ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSites() {
    if (sites.length > 0) return;
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
    setSaving(true);
    setError(null);
    setMessage(null);

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

    try {
      const res = await fetch("/api/bing/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Sync failed");
      }
      setMessage(
        `Synced ${data.daysUpserted} days, ${data.queriesUpserted} query weeks, ` +
          `${data.pagesUpserted} page weeks.`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Bing Webmaster property
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Bing reports its own queries, pages and crawl stats. The property URL
            often differs from the Search Console one, so pick it explicitly.
          </p>
        </div>
        {bingSite ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-signal/10 px-2.5 py-1 text-xs font-medium text-signal">
            <CheckCircle2 className="size-3.5" />
            Connected
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <XCircle className="size-3.5" />
            Not connected
          </span>
        )}
      </div>

      {!keyConnected ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Add a Bing Webmaster Tools API key above first.
        </p>
      ) : (
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

            <button
              type="button"
              onClick={handleSave}
              disabled={!selected || selected === bingSite || saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Save className="size-3" />
              )}
              Save
            </button>

            <button
              type="button"
              onClick={handleSync}
              disabled={!bingSite || syncing}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Sync Bing
            </button>
          </div>

          {message && <p className="text-xs text-signal">{message}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
