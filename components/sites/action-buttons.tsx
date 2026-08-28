"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PAGE_LIMIT_ITEMS = [
  { value: "25", label: "25 pages" },
  { value: "50", label: "50 pages" },
  { value: "100", label: "100 pages" },
  { value: "200", label: "200 pages" },
  { value: "custom", label: "Custom" },
];
const MAX_CUSTOM_PAGES = 2000;
const MIN_CUSTOM_PAGES = 1;

export function CrawlButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [limitSelection, setLimitSelection] = useState("200");
  const [customValue, setCustomValue] = useState("");

  const isCustom = limitSelection === "custom";
  const maxPages = isCustom
    ? Math.max(MIN_CUSTOM_PAGES, Math.min(MAX_CUSTOM_PAGES, Math.floor(Number(customValue) || 200)))
    : Number(limitSelection);

  async function run() {
    setLoading(true);
    setMsg(null);
    setErr(false);
    try {
      const res = await fetch(`/api/sites/${siteId}/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Crawl failed");
      setMsg(`Crawl started (ID: ${data.crawlId?.slice(0, 8)}...)`);
      router.refresh();
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Crawl failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Select
          value={limitSelection}
          onValueChange={(v) => v && setLimitSelection(v)}
          items={PAGE_LIMIT_ITEMS}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_LIMIT_ITEMS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isCustom && (
          <input
            type="number"
            min={MIN_CUSTOM_PAGES}
            max={MAX_CUSTOM_PAGES}
            placeholder="Pages"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value.replace(/\D/g, ""))}
            className="h-7 w-20 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={loading || (isCustom && (!customValue || Number(customValue) < MIN_CUSTOM_PAGES))}
          onClick={run}
        >
          {loading ? "Starting…" : "Run crawl"}
        </Button>
      </div>
      {msg && (
        <p className={cn("text-atom-caption", err ? "text-danger" : "text-signal")}>
          {msg}
        </p>
      )}
    </div>
  );
}

export function VitalsButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function run() {
    setLoading(true);
    setMsg(null);
    setErr(false);
    try {
      const res = await fetch(`/api/sites/${siteId}/vitals`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vitals failed");
      setMsg(`Saved ${data.inserted} PageSpeed reports`);
      router.refresh();
    } catch (e) {
      setErr(true);
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={run}
      >
        {loading ? "Checking…" : "Check vitals"}
      </Button>
      {msg && (
        <p className={cn("text-atom-caption", err ? "text-danger" : "text-signal")}>
          {msg}
        </p>
      )}
    </div>
  );
}

export function IndexCheckButton({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [results, setResults] = useState<
    { url: string; coverageState?: string; error?: string; ok?: boolean }[]
  >([]);

  async function run() {
    setLoading(true);
    setResults([]);
    setReauthRequired(false);
    try {
      const res = await fetch(`/api/sites/${siteId}/index-status`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.status === 401 && data.code === "REAUTH_REQUIRED") {
        setReauthRequired(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed");
      setResults(data.results || []);
    } catch (e) {
      setResults([
        {
          url: "—",
          ok: false,
          error: e instanceof Error ? e.message : "Failed",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={run}
      >
        {loading ? "Inspecting…" : "Check index status"}
      </Button>
      {reauthRequired && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="text-muted-foreground">
              Your Google connection expired.{" "}
              <button
                onClick={() => signIn("google")}
                className="font-medium text-primary underline underline-offset-2"
              >
                Reconnect &rarr;
              </button>
            </p>
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.url + (r.coverageState || r.error)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-atom-caption shadow-[var(--shadow-1)]"
            >
              <p className="truncate font-medium text-foreground">{r.url}</p>
              <p className={r.ok === false ? "text-danger" : "text-signal"}>
                {r.error || r.coverageState || "Unknown"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExportLinks({ siteId }: { siteId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`/api/sites/${siteId}/export?type=keywords`}
        className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-atom-caption font-medium text-muted-foreground shadow-[var(--shadow-1)] transition hover:bg-muted hover:text-foreground"
      >
        Export keywords CSV
      </a>
      <a
        href={`/api/sites/${siteId}/export?type=pages`}
        className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-atom-caption font-medium text-muted-foreground shadow-[var(--shadow-1)] transition hover:bg-muted hover:text-foreground"
      >
        Export pages CSV
      </a>
    </div>
  );
}
