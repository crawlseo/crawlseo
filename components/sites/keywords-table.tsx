"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import type { KeywordRow } from "@/lib/seo-metrics";
import {
  PositionBadge,
  MetricTable,
  CtrCell,
  NumCell,
} from "@/components/ui/data-table";

type PositionFilter = "all" | "top3" | "top10" | "11-20" | "20+";
type SortKey = "clicks" | "impressions" | "position" | "ctr";

const POSITION_OPTIONS: { value: PositionFilter; label: string }[] = [
  { value: "all", label: "All positions" },
  { value: "top3", label: "Top 3" },
  { value: "top10", label: "Top 10" },
  { value: "11-20", label: "11–20" },
  { value: "20+", label: "20+" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "clicks", label: "Clicks" },
  { value: "impressions", label: "Impressions" },
  { value: "position", label: "Position" },
  { value: "ctr", label: "CTR" },
];

function matchesPosition(position: number, filter: PositionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "top3") return position > 0 && position <= 3;
  if (filter === "top10") return position > 0 && position <= 10;
  if (filter === "11-20") return position > 10 && position <= 20;
  return position > 20;
}

function parseMin(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function KeywordsTable({
  keywords,
  siteId,
}: {
  keywords: KeywordRow[];
  siteId: string;
}) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionFilter>("all");
  const [minClicks, setMinClicks] = useState("");
  const [minImpressions, setMinImpressions] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("clicks");

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const minClicksNum = parseMin(minClicks);
  const minImpressionsNum = parseMin(minImpressions);

  const filtered = useMemo(() => {
    const rows = keywords.filter((k) => {
      if (deferredSearch && !k.query.toLowerCase().includes(deferredSearch)) {
        return false;
      }
      if (!matchesPosition(k.position, position)) return false;
      if (minClicksNum != null && k.clicks < minClicksNum) return false;
      if (minImpressionsNum != null && k.impressions < minImpressionsNum) {
        return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      if (sortBy === "position") {
        return a.position - b.position || b.impressions - a.impressions;
      }
      if (sortBy === "impressions") {
        return b.impressions - a.impressions || b.clicks - a.clicks;
      }
      if (sortBy === "ctr") {
        return b.ctr - a.ctr || b.impressions - a.impressions;
      }
      return b.clicks - a.clicks || b.impressions - a.impressions;
    });

    return rows;
  }, [
    keywords,
    deferredSearch,
    position,
    minClicksNum,
    minImpressionsNum,
    sortBy,
  ]);

  const hasActiveFilters =
    search.trim() !== "" ||
    position !== "all" ||
    minClicks.trim() !== "" ||
    minImpressions.trim() !== "" ||
    sortBy !== "clicks";

  function clearFilters() {
    setSearch("");
    setPosition("all");
    setMinClicks("");
    setMinImpressions("");
    setSortBy("clicks");
  }

  const inputClass =
    "h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Search
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by query…"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Position
          </span>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as PositionFilter)}
            className={`${inputClass} pr-8`}
          >
            {POSITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-28 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Min clicks
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={minClicks}
            onChange={(e) => setMinClicks(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </label>

        <label className="flex w-32 flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Min impressions
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={minImpressions}
            onChange={(e) => setMinImpressions(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Sort by
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className={`${inputClass} pr-8`}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="panel px-4 py-10 text-center">
          <p className="font-medium text-foreground">No keywords match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Loosen position, clicks, or impressions filters.
          </p>
        </div>
      ) : (
        <MetricTable
          headers={[
            { label: "Query" },
            { label: "Position", align: "right" },
            { label: "Clicks", align: "right" },
            { label: "Impressions", align: "right" },
            { label: "CTR", align: "right" },
          ]}
          footer={`Showing ${filtered.length} of ${keywords.length} keywords · sorted by ${sortBy}`}
        >
          {filtered.map((keyword) => (
            <tr
              key={keyword.query}
              className="transition-colors hover:bg-muted/25"
            >
              <td className="max-w-md px-4 py-3">
                <Link
                  href={`/sites/${siteId}/keywords/detail?query=${encodeURIComponent(keyword.query)}`}
                  className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition hover:decoration-primary"
                >
                  {keyword.query}
                </Link>
              </td>
              <td className="px-4 py-3 text-right">
                <PositionBadge position={keyword.position} />
              </td>
              <td className="px-4 py-3 text-right">
                <NumCell value={keyword.clicks} />
              </td>
              <td className="px-4 py-3 text-right">
                <NumCell value={keyword.impressions} />
              </td>
              <td className="px-4 py-3 text-right">
                <CtrCell ctr={keyword.ctr} />
              </td>
            </tr>
          ))}
        </MetricTable>
      )}
    </div>
  );
}
