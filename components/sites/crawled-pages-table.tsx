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
  { label: "Status", align: "right", sortKey: "statusCode" },
  { label: "Score", align: "right", sortKey: "contentScore" },
  { label: "Words", align: "right", sortKey: "wordCount" },
  { label: "H1s", align: "right", sortKey: "h1Count" },
  { label: "Images", align: "right", sortKey: "imagesMissingAlt" },
  { label: "Int. links", align: "right", sortKey: "internalLinks" },
  { label: "Time", align: "right", sortKey: "responseTimeMs" },
];

export interface CrawledPageRowData {
  id: string;
  url: string;
  statusCode: number;
  contentScore: number;
  wordCount: number;
  h1Count: number;
  imageCount: number;
  imagesMissingAlt: number;
  internalLinks: number;
  responseTimeMs: number;
}

export function CrawledPagesTable({ rows }: { rows: CrawledPageRowData[] }) {
  const [search, setSearch] = useState("");
  const { sort, toggle } = useTableSort({ key: "contentScore", dir: "desc" });

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
          <p className="font-medium text-foreground">No pages match</p>
          <p className="mt-1 text-sm text-muted-foreground">Loosen the search.</p>
        </div>
      ) : (
        <MetricTable
          sort={sort}
          onSort={toggle}
          headers={HEADERS}
          footer={`Showing ${filtered.length} of ${rows.length} pages · sorted by ${sortLabel(HEADERS, sort)}`}
        >
          {filtered.map((p) => (
            <tr key={p.id} className="hover:bg-muted/20">
              <td className="max-w-md truncate px-4 py-2.5 font-medium" title={p.url}>
                {p.url}
              </td>
              <td className="px-4 py-2.5 text-right font-data">
                <span
                  className={cn(
                    p.statusCode >= 400
                      ? "text-danger"
                      : p.statusCode >= 300
                        ? "text-warning"
                        : "text-signal"
                  )}
                >
                  {p.statusCode}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right font-data">
                <span
                  className={cn(
                    p.contentScore >= 70
                      ? "text-signal"
                      : p.contentScore >= 50
                        ? "text-warning"
                        : "text-danger"
                  )}
                >
                  {p.contentScore}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                {p.wordCount}
              </td>
              <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                {p.h1Count}
              </td>
              <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                {p.imagesMissingAlt > 0 ? (
                  <span className="text-warning">
                    {p.imagesMissingAlt}/{p.imageCount}
                  </span>
                ) : (
                  p.imageCount
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                {p.internalLinks}
              </td>
              <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                {p.responseTimeMs}ms
              </td>
            </tr>
          ))}
        </MetricTable>
      )}
    </div>
  );
}
