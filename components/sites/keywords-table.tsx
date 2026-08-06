"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { KeywordRow } from "@/lib/seo-metrics";
import {
  PositionBadge,
  MetricTable,
  CtrCell,
  NumCell,
  useTableSort,
  sortRows,
  sortLabel,
  SearchField,
  filterInputClass,
  matchesPosition,
  parseMin,
  POSITION_OPTIONS,
  type MetricHeader,
  type PositionFilter,
  type SortDir,
} from "@/components/ui/data-table";

type SortKey = "query" | "clicks" | "impressions" | "position" | "ctr";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "clicks", label: "Clicks" },
  { value: "impressions", label: "Impressions" },
  { value: "position", label: "Position" },
  { value: "ctr", label: "CTR" },
];

const HEADERS: MetricHeader[] = [
  { label: "Query", sortKey: "query", defaultDir: "asc" },
  { label: "Position", align: "right", sortKey: "position", defaultDir: "asc" },
  { label: "Clicks", align: "right", sortKey: "clicks" },
  { label: "Impressions", align: "right", sortKey: "impressions" },
  { label: "CTR", align: "right", sortKey: "ctr" },
];

const DEFAULT_DIRS: Record<SortKey, SortDir> = {
  query: "asc",
  position: "asc",
  clicks: "desc",
  impressions: "desc",
  ctr: "desc",
};

export function KeywordsTable({ keywords }: { keywords: KeywordRow[] }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionFilter>("all");
  const [minClicks, setMinClicks] = useState("");
  const [minImpressions, setMinImpressions] = useState("");
  const { sort, setSort, toggle } = useTableSort({ key: "clicks", dir: "desc" });

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

    return sortRows(rows, sort);
  }, [
    keywords,
    deferredSearch,
    position,
    minClicksNum,
    minImpressionsNum,
    sort,
  ]);

  const hasActiveFilters =
    search.trim() !== "" ||
    position !== "all" ||
    minClicks.trim() !== "" ||
    minImpressions.trim() !== "" ||
    sort.key !== "clicks" ||
    sort.dir !== "desc";

  function clearFilters() {
    setSearch("");
    setPosition("all");
    setMinClicks("");
    setMinImpressions("");
    setSort({ key: "clicks", dir: "desc" });
  }


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Filter by query..."
        />

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Position
          </span>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as PositionFilter)}
            className={`${filterInputClass} pr-8`}
          >
            {POSITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Min clicks
          </span>
          <input
            type="number"
            min={0}
            value={minClicks}
            onChange={(e) => setMinClicks(e.target.value)}
            placeholder="0"
            className={`${filterInputClass} w-24`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Min impressions
          </span>
          <input
            type="number"
            min={0}
            value={minImpressions}
            onChange={(e) => setMinImpressions(e.target.value)}
            placeholder="0"
            className={`${filterInputClass} w-24`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Sort by
          </span>
          <select
            value={sort.key}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSort({ key, dir: DEFAULT_DIRS[key] });
            }}
            className={`${filterInputClass} pr-8`}
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
            className="h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
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
          sort={sort}
          onSort={toggle}
          headers={HEADERS}
          footer={`Showing ${filtered.length} of ${keywords.length} keywords · sorted by ${sortLabel(HEADERS, sort)}`}
        >
          {filtered.map((keyword) => (
            <tr
              key={keyword.query}
              className="transition-colors hover:bg-muted/25"
            >
              <td className="max-w-md px-4 py-3">
                <span className="font-medium text-foreground">
                  {keyword.query}
                </span>
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
