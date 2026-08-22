"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MetricTable,
  useTableSort,
  sortRows,
  sortLabel,
  SearchField,
  type MetricHeader,
} from "@/components/ui/data-table";

const HEADERS: MetricHeader[] = [
  { label: "URL", sortKey: "url", defaultDir: "asc" },
  { label: "Score", align: "right", sortKey: "perfScore", defaultDir: "asc" },
  { label: "LCP", align: "right", sortKey: "lcp" },
  { label: "CLS", align: "right", sortKey: "cls" },
  { label: "INP", align: "right", sortKey: "inp" },
  { label: "TTFB", align: "right", sortKey: "ttfb" },
  { label: "When", sortKey: "date" },
];

export interface VitalsRowData {
  id: string;
  url: string;
  perfScore: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  /** ISO string — serialized across the RSC boundary */
  date: string;
}

export function VitalsTable({ rows }: { rows: VitalsRowData[] }) {
  const [search, setSearch] = useState("");
  const { sort, toggle } = useTableSort({ key: "date", dir: "desc" });

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const filtered = useMemo(() => {
    const out = deferredSearch
      ? rows.filter((r) => r.url.toLowerCase().includes(deferredSearch))
      : rows;
    return sortRows(out, sort);
  }, [rows, deferredSearch, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SearchField value={search} onChange={setSearch} placeholder="Filter by URL..." />
      </div>

      {filtered.length === 0 ? (
        <div className="panel px-4 py-10 text-center">
          <p className="font-medium text-foreground">No reports match</p>
          <p className="mt-1 text-sm text-muted-foreground">Loosen the search.</p>
        </div>
      ) : (
        <MetricTable
          sort={sort}
          onSort={toggle}
          headers={HEADERS}
          footer={`Showing ${filtered.length} of ${rows.length} reports · sorted by ${sortLabel(HEADERS, sort)}`}
        >
          {filtered.map((r) => (
            <tr key={r.id} className="hover:bg-muted/20">
              <td className="max-w-xs truncate px-4 py-2.5 font-medium" title={r.url}>
                {r.url}
              </td>
              <td className="px-4 py-2.5 text-right font-data">
                <span
                  className={cn(
                    (r.perfScore ?? 0) >= 90
                      ? "text-signal"
                      : (r.perfScore ?? 0) >= 50
                        ? "text-warning"
                        : "text-danger"
                  )}
                >
                  {r.perfScore ?? "—"}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right font-data">
                {r.lcp != null ? `${r.lcp.toFixed(2)}s` : "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-data">
                {r.cls != null ? r.cls.toFixed(3) : "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-data">
                {r.inp != null ? `${Math.round(r.inp)}ms` : "—"}
              </td>
              <td className="px-4 py-2.5 text-right font-data">
                {r.ttfb != null ? `${r.ttfb.toFixed(2)}s` : "—"}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {new Date(r.date).toLocaleString()}
              </td>
            </tr>
          ))}
        </MetricTable>
      )}
    </div>
  );
}
