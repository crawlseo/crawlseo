"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

// Rows per table page. The table holds every page of the crawl, so the URL
// filter and the sort cover all of them; paging only limits what is drawn (#56).
export const PAGE_SIZE = 100;

/**
 * One table page of the filtered rows, and the footer line that says what is
 * shown: "Showing 100 of 205 pages, 1 to 100".
 */
export function paginate<T>(filtered: T[], total: number, pageIndex: number) {
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const first = current * PAGE_SIZE + 1;
  const pages = (n: number) => (n === 1 ? "page" : "pages");
  const of =
    filtered.length === total
      ? `${total} ${pages(total)}`
      : `${filtered.length} matching ${pages(filtered.length)} (${total} in total)`;
  const range = pageCount > 1 ? `, ${first} to ${first + shown.length - 1}` : "";
  return { shown, current, pageCount, summary: `Showing ${shown.length} of ${of}${range}` };
}

export function CrawledPagesTable({ rows }: { rows: CrawledPageRowData[] }) {
  const [search, setSearch] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const { sort, toggle } = useTableSort({ key: "contentScore", dir: "desc" });

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const filtered = useMemo(() => {
    const out = deferredSearch
      ? rows.filter((r) => r.url.toLowerCase().includes(deferredSearch))
      : rows;
    return sortRows(out, sort);
  }, [rows, deferredSearch, sort]);

  const { shown, current, pageCount, summary } = paginate(filtered, rows.length, pageIndex);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPageIndex(0);
          }}
          placeholder="Filter by URL..."
        />
      </div>

      {filtered.length === 0 ? (
        <div className="panel px-4 py-10 text-center">
          <p className="font-medium text-text-strong">No pages match</p>
          <p className="mt-1 text-sm text-muted-foreground">Loosen the search.</p>
        </div>
      ) : (
        <MetricTable
          sort={sort}
          onSort={(key, dir) => {
            toggle(key, dir);
            setPageIndex(0);
          }}
          headers={HEADERS}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {summary} · sorted by {sortLabel(HEADERS, sort)}
              </span>
              {pageCount > 1 && (
                <nav aria-label="Crawled pages" className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={current === 0}
                    onClick={() => setPageIndex(current - 1)}
                  >
                    Previous
                  </Button>
                  <span className="font-data">
                    Page {current + 1} of {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={current === pageCount - 1}
                    onClick={() => setPageIndex(current + 1)}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </div>
          }
        >
          {shown.map((p) => (
            <tr key={p.id} className="hover:bg-bg-soft">
              <td className="max-w-md truncate px-4 py-[11px] font-data text-[12px] text-text-strong" title={p.url}>
                {p.url}
              </td>
              <td className="px-4 py-[11px] text-right font-data">
                <span
                  className={cn(
                    p.statusCode >= 400
                      ? "text-danger"
                      : p.statusCode >= 300
                        ? "text-warning"
                        : "text-success"
                  )}
                >
                  {p.statusCode}
                </span>
              </td>
              <td className="px-4 py-[11px] text-right font-data">
                <span
                  className={cn(
                    p.contentScore >= 70
                      ? "text-success"
                      : p.contentScore >= 50
                        ? "text-warning"
                        : "text-danger"
                  )}
                >
                  {p.contentScore}
                </span>
              </td>
              <td className="px-4 py-[11px] text-right font-data text-muted-foreground">
                {p.wordCount}
              </td>
              <td className="px-4 py-[11px] text-right font-data text-muted-foreground">
                {p.h1Count}
              </td>
              <td className="px-4 py-[11px] text-right font-data text-muted-foreground">
                {p.imagesMissingAlt > 0 ? (
                  <span className="text-warning">
                    {p.imagesMissingAlt}/{p.imageCount}
                  </span>
                ) : (
                  p.imageCount
                )}
              </td>
              <td className="px-4 py-[11px] text-right font-data text-muted-foreground">
                {p.internalLinks}
              </td>
              <td className="px-4 py-[11px] text-right font-data text-muted-foreground">
                {p.responseTimeMs}ms
              </td>
            </tr>
          ))}
        </MetricTable>
      )}
    </div>
  );
}
