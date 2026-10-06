"use client";

import { useState } from "react";
import {
  Link as LinkIcon,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

type BacklinkItem = {
  referringDomain: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  dofollow: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
};

type BacklinksOverview = {
  totalBacklinks: number;
  referringDomains: number;
  referringIps?: number;
  dofollow: number;
  nofollow: number;
};

export function BacklinksClient({
  siteId,
  domain,
  hasDataForSEO,
}: {
  siteId: string;
  domain: string;
  hasDataForSEO: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [overview, setOverview] = useState<BacklinksOverview | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function handleLoad() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/backlinks`);
      const data = await res.json();
      setSource(data.source);
      setOverview(data.overview);
      setBacklinks(data.backlinks ?? []);
      setLoaded(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {!hasDataForSEO && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-bg p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-text-strong">
              Limited backlink data
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Add a DataForSEO API key in{" "}
              <Link
                href={`/sites/${siteId}/settings`}
                className="text-link"
              >
                Settings
              </Link>{" "}
              for full backlink analysis with referring domains and anchor text.
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleLoad}
        disabled={loading}
        className={buttonVariants()}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : loaded ? (
          <RefreshCw className="size-4" />
        ) : (
          <LinkIcon className="size-4" />
        )}
        {loaded ? "Refresh" : "Load backlinks"}
      </button>

      {/* Overview stats */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total backlinks"
            value={overview.totalBacklinks.toLocaleString()}
          />
          <StatCard
            label="Referring domains"
            value={overview.referringDomains.toLocaleString()}
          />
          <StatCard
            label="Dofollow"
            value={overview.dofollow.toLocaleString()}
          />
          <StatCard
            label="Nofollow"
            value={overview.nofollow.toLocaleString()}
          />
        </div>
      )}

      {/* Backlinks table */}
      {loaded && backlinks.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Referring Domain
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Target URL
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Anchor Text
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {backlinks.map((link, i) => (
                  <tr
                    key={`${link.sourceUrl}-${i}`}
                    className="border-b border-border transition-colors hover:bg-bg-soft"
                  >
                    <td className="max-w-[200px] px-4 py-3">
                      <span className="block truncate font-medium text-text-strong">
                        {link.referringDomain || new URL(link.sourceUrl).hostname}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {link.sourceUrl}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <span className="block truncate text-foreground">
                        {link.targetUrl}
                      </span>
                    </td>
                    <td className="max-w-[150px] px-4 py-3">
                      <span className="block truncate text-muted-foreground">
                        {link.anchorText || "n/a"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`mono-label rounded-md border px-2 py-0.5 text-[11px] ${
                          link.dofollow
                            ? "border-success/30 bg-success-bg text-success"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {link.dofollow ? "dofollow" : "nofollow"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-bg-soft px-4 py-2 text-xs text-muted-foreground">
            {backlinks.length} backlink{backlinks.length !== 1 ? "s" : ""}
            {source === "dataforseo" ? " via DataForSEO" : " from crawl data"}
          </div>
        </div>
      )}

      {/* Empty state */}
      {loaded && backlinks.length === 0 && (
        <div className="panel flex flex-col items-center py-12 text-center">
          <LinkIcon className="size-10 text-text-faint" />
          <p className="mt-3 font-medium text-text-strong">No backlinks found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {source === "none"
              ? "Run a site crawl first to discover external links, or add a DataForSEO API key for full backlink data"
              : "No backlink data available"}
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-4 py-3">
      <p className="mono-label text-[11px] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-data text-xl font-medium text-text-strong">
        {value}
      </p>
    </div>
  );
}
