"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHeaderStatus } from "@/components/ui/header-status";
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
          <SelectTrigger aria-label="Pages to crawl" className="h-[38px] bg-bg data-[size=default]:h-[38px]">
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
            aria-label="Pages to crawl"
            className="h-[38px] w-20 rounded-md border border-border bg-bg-section px-2 font-data text-[13px] text-text-strong outline-none focus:border-brand-500 focus:bg-bg"
          />
        )}
        <Button
          variant="outline"
          disabled={loading || (isCustom && (!customValue || Number(customValue) < MIN_CUSTOM_PAGES))}
          onClick={run}
        >
          {loading ? "Starting…" : "Run crawl"}
        </Button>
      </div>
      {msg && (
        <p className={cn("text-atom-caption", err ? "text-danger" : "text-success")}>
          {msg}
        </p>
      )}
    </div>
  );
}

type VitalsStatus =
  | { kind: "ok" | "error"; text: string }
  | { kind: "quota" };

export function VitalsStatusMessage({
  siteId,
  status,
}: {
  siteId: string;
  status: VitalsStatus;
}) {
  if (status.kind === "quota") {
    return (
      <p role="alert" className="max-w-2xl text-atom-caption text-danger">
        The PageSpeed Insights quota is exhausted. Add your own Google
        PageSpeed key in{" "}
        <Link
          href={`/sites/${siteId}/settings#api-keys`}
          className="text-link font-medium"
        >
          Settings → API keys
        </Link>{" "}
        to keep checking vitals.
      </p>
    );
  }
  return (
    <p
      role={status.kind === "error" ? "alert" : "status"}
      className={cn(
        "max-w-2xl break-words text-atom-caption",
        status.kind === "error" ? "text-danger" : "text-success"
      )}
    >
      {status.text}
    </p>
  );
}

export function VitalsButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const setHeaderStatus = useHeaderStatus();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<VitalsStatus | null>(null);

  // Inside a PageHeader the message goes on its own full-width row under the
  // header; next to the button it would squeeze the title column.
  useEffect(() => {
    if (!setHeaderStatus) return;
    setHeaderStatus(
      status ? <VitalsStatusMessage siteId={siteId} status={status} /> : null
    );
  }, [setHeaderStatus, siteId, status]);
  useEffect(() => () => setHeaderStatus?.(null), [setHeaderStatus]);

  async function run() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/vitals`, { method: "POST" });
      const data = await res.json();
      if (data.code === "QUOTA_EXCEEDED") {
        setStatus({ kind: "quota" });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Vitals failed");
      setStatus({ kind: "ok", text: `Saved ${data.inserted} PageSpeed reports` });
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="outline" disabled={loading} onClick={run}>
        {loading ? "Checking…" : "Check vitals"}
      </Button>
      {status && !setHeaderStatus && (
        <VitalsStatusMessage siteId={siteId} status={status} />
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
          url: "n/a",
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
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-bg p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="text-muted-foreground">
              Your Google connection expired.{" "}
              <button
                onClick={() => signIn("google")}
                className="text-link font-medium"
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
              className="rounded-md border border-border bg-card px-3 py-2 text-atom-caption"
            >
              <p className="truncate font-data text-text-strong">{r.url}</p>
              <p className={r.ok === false ? "text-danger" : "text-success"}>
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
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Export keywords CSV
      </a>
      <a
        href={`/api/sites/${siteId}/export?type=pages`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Export pages CSV
      </a>
    </div>
  );
}
