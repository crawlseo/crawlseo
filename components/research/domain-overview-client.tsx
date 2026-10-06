"use client";

import { useState } from "react";
import {
  Globe,
  Search,
  Loader2,
  AlertTriangle,
  ArrowRightLeft,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

type DomainData = {
  source: string;
  domain: string;
  overview: {
    organicKeywords: number;
    organicTraffic: number;
    organicCost: number | null;
    backlinks: number | null;
    referringDomains: number | null;
  } | null;
  backlinks: {
    totalBacklinks: number;
    referringDomains: number;
    dofollow: number;
    nofollow: number;
  } | null;
  metrics?: {
    current: { clicks: number; impressions: number; avgPosition: number };
    previous: { clicks: number; impressions: number; avgPosition: number };
    deltas: { clicks: number; impressions: number; avgPosition: number };
  };
};

export function DomainOverviewClient({
  siteId,
  domain,
  hasDataForSEO,
}: {
  siteId: string;
  domain: string;
  hasDataForSEO: boolean;
}) {
  const [ownData, setOwnData] = useState<DomainData | null>(null);
  const [competitorDomain, setCompetitorDomain] = useState("");
  const [competitorData, setCompetitorData] = useState<DomainData | null>(null);
  const [loadingOwn, setLoadingOwn] = useState(false);
  const [loadingCompetitor, setLoadingCompetitor] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadOwnDomain() {
    setLoadingOwn(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/domain-overview`);
      const data = await res.json();
      setOwnData(data);
      setLoaded(true);
    } catch {
      // ignore
    } finally {
      setLoadingOwn(false);
    }
  }

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    if (!competitorDomain.trim()) return;

    if (!loaded) await loadOwnDomain();

    setLoadingCompetitor(true);
    try {
      const res = await fetch(
        `/api/sites/${siteId}/domain-overview?domain=${encodeURIComponent(competitorDomain.trim())}`
      );
      const data = await res.json();
      setCompetitorData(data);
    } catch {
      // ignore
    } finally {
      setLoadingCompetitor(false);
    }
  }

  return (
    <div className="space-y-6">
      {!hasDataForSEO && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-bg p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-text-strong">
              Limited data: GSC metrics only
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Add a DataForSEO API key in{" "}
              <Link
                href={`/sites/${siteId}/settings`}
                className="text-link"
              >
                Settings
              </Link>{" "}
              for full domain analysis and competitor comparison.
            </p>
          </div>
        </div>
      )}

      {/* Load own domain / Compare competitor */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <button
          type="button"
          onClick={loadOwnDomain}
          disabled={loadingOwn}
          className={buttonVariants()}
        >
          {loadingOwn ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Globe className="size-4" />
          )}
          Analyze {domain}
        </button>

        {hasDataForSEO && (
          <form onSubmit={handleCompare} className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <ArrowRightLeft className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={competitorDomain}
                onChange={(e) => setCompetitorDomain(e.target.value)}
                placeholder="Enter competitor domain..."
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:bg-bg focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={!competitorDomain.trim() || loadingCompetitor}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-text-strong transition hover:bg-muted disabled:opacity-50"
            >
              {loadingCompetitor ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Compare
            </button>
          </form>
        )}
      </div>

      {/* Results - side by side */}
      {(ownData || competitorData) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {ownData && (
            <DomainCard data={ownData} label="Your domain" />
          )}
          {competitorData && (
            <DomainCard data={competitorData} label="Competitor" />
          )}
        </div>
      )}
    </div>
  );
}

function DomainCard({ data, label }: { data: DomainData; label: string }) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow text-[12px]">
            {label}
          </p>
          <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
            {data.domain}
          </h3>
        </div>
        <span className="mono-label rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {data.source}
        </span>
      </div>

      {data.overview ? (
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Organic keywords"
            value={data.overview.organicKeywords.toLocaleString()}
          />
          <MetricCard
            label="Organic traffic"
            value={data.overview.organicTraffic.toLocaleString()}
          />
          {data.overview.organicCost != null && (
            <MetricCard
              label="Traffic cost"
              value={`$${data.overview.organicCost.toLocaleString()}`}
            />
          )}
          {data.overview.backlinks != null && (
            <MetricCard
              label="Backlinks"
              value={data.overview.backlinks.toLocaleString()}
            />
          )}
          {data.overview.referringDomains != null && (
            <MetricCard
              label="Referring domains"
              value={data.overview.referringDomains.toLocaleString()}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <Globe className="size-8 text-text-faint" />
          <p className="mt-2 text-sm text-muted-foreground">
            No data available for this domain
          </p>
        </div>
      )}

      {data.backlinks && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 mono-label text-[12px] text-muted-foreground">
            Backlink Summary
          </p>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Total backlinks"
              value={data.backlinks.totalBacklinks.toLocaleString()}
            />
            <MetricCard
              label="Referring domains"
              value={data.backlinks.referringDomains.toLocaleString()}
            />
            <MetricCard
              label="Dofollow"
              value={data.backlinks.dofollow.toLocaleString()}
            />
            <MetricCard
              label="Nofollow"
              value={data.backlinks.nofollow.toLocaleString()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
      <p className="mono-label text-[11px] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-data text-lg font-medium text-text-strong">
        {value}
      </p>
    </div>
  );
}
