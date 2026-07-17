"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CrawlButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function run() {
    setLoading(true);
    setMsg(null);
    setErr(false);
    try {
      const res = await fetch(`/api/sites/${siteId}/crawl`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Crawl failed");
      setMsg(
        `Health ${data.healthScore}/100 · ${data.pagesFound} pages · ${data.issuesFound} issues`
      );
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
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={run}
        className="border-border/80"
      >
        {loading ? "Crawling…" : "Run crawl"}
      </Button>
      {msg && (
        <p className={cn("text-xs", err ? "text-danger" : "text-signal")}>{msg}</p>
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
        className="border-border/80"
      >
        {loading ? "Checking…" : "Check vitals"}
      </Button>
      {msg && (
        <p className={cn("text-xs", err ? "text-danger" : "text-signal")}>{msg}</p>
      )}
    </div>
  );
}

export function IndexCheckButton({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<
    { url: string; coverageState?: string; error?: string; ok?: boolean }[]
  >([]);

  async function run() {
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`/api/sites/${siteId}/index-status`, {
        method: "POST",
      });
      const data = await res.json();
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
        className="border-border/80"
      >
        {loading ? "Inspecting…" : "Check index status"}
      </Button>
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.url + (r.coverageState || r.error)}
              className="rounded-lg border border-border/50 bg-panel/60 px-3 py-2 text-xs"
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
        className="inline-flex h-8 items-center rounded-lg border border-border/80 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        Export keywords CSV
      </a>
      <a
        href={`/api/sites/${siteId}/export?type=pages`}
        className="inline-flex h-8 items-center rounded-lg border border-border/80 px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        Export pages CSV
      </a>
    </div>
  );
}
