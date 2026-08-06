"use client";

import { useDeferredValue, useMemo, useState } from "react";
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
} from "@/components/ui/data-table";

const HEADERS: MetricHeader[] = [
  { label: "URL", sortKey: "url", defaultDir: "asc" },
  { label: "Position", align: "right", sortKey: "position", defaultDir: "asc" },
  { label: "Clicks", align: "right", sortKey: "clicks" },
  { label: "Impressions", align: "right", sortKey: "impressions" },
  { label: "CTR", align: "right", sortKey: "ctr" },
];

export interface PageRowData {
  url: string;
  position: number;
  clicks: number;
  impressions: number;
  ctr: number;
}

export function PagesTable({
  rows,
  domain,
}: {
  rows: PageRowData[];
  domain: string;
}) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PositionFilter>("all");
  const [minClicks, setMinClicks] = useState("");
  const [minImpressions, setMinImpressions] = useState("");
  const { sort, toggle } = useTableSort({ key: "clicks", dir: "desc" });

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const minClicksNum = parseMin(minClicks);
  const minImpressionsNum = parseMin(minImpressions);

  const filtered = useMemo(() => {
    const out = rows.filter((p) => {
      if (deferredSearch && !p.url.toLowerCase().includes(deferredSearch)) return false;
      if (!matchesPosition(p.position, position)) return false;
      if (minClicksNum != null && p.clicks < minClicksNum) return false;
      if (minImpressionsNum != null && p.impressions < minImpressionsNum) return false;
      return true;
    });
    return sortRows(out, sort);
  }, [rows, deferredSearch, position, minClicksNum, minImpressionsNum, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SearchField value={search} onChange={setSearch} placeholder="Filter by URL..." />

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
      </div>

      {filtered.length === 0 ? (
        <div className="panel px-4 py-10 text-center">
          <p className="font-medium text-foreground">No pages match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Loosen the search or filters.
          </p>
        </div>
      ) : (
        <MetricTable
          sort={sort}
          onSort={toggle}
          headers={HEADERS}
          footer={`Showing ${filtered.length} of ${rows.length} pages · sorted by ${sortLabel(HEADERS, sort)}`}
        >
          {filtered.map((page) => {
            const href = page.url.startsWith("http")
              ? page.url
              : `https://${domain}${page.url.startsWith("/") ? "" : "/"}${page.url}`;

            return (
              <tr key={page.url} className="transition-colors hover:bg-muted/25">
                <td className="max-w-xl px-4 py-3">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all font-medium text-signal hover:underline"
                  >
                    {page.url}
                  </a>
                </td>
                <td className="px-4 py-3 text-right">
                  <PositionBadge position={page.position} />
                </td>
                <td className="px-4 py-3 text-right">
                  <NumCell value={page.clicks} />
                </td>
                <td className="px-4 py-3 text-right">
                  <NumCell value={page.impressions} />
                </td>
                <td className="px-4 py-3 text-right">
                  <CtrCell ctr={page.ctr} />
                </td>
              </tr>
            );
          })}
        </MetricTable>
      )}
    </div>
  );
}
