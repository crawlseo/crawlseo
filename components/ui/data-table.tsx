"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { positionBand, formatPosition, formatCtr } from "@/lib/seo-metrics";

export function PositionBadge({ position }: { position: number }) {
  const band = positionBand(position);
  return (
    <span
      className={cn(
        "inline-flex min-w-12 items-center justify-center rounded-md px-2 py-0.5 font-data text-xs font-semibold",
        band === "top3" && "rank-top3",
        band === "top10" && "rank-top10",
        band === "top20" && "rank-top20",
        band === "deep" && "rank-deep"
      )}
    >
      {formatPosition(position)}
    </span>
  );
}

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDir;
}
export interface MetricHeader {
  label: string;
  align?: "left" | "right";
  /** Present ⇒ the header is clickable and sorts by this key */
  sortKey?: string;
  /** Direction applied on first click (default "desc"; use "asc" for position/text) */
  defaultDir?: SortDir;
}

/** Shared sort-state hook: click same column ⇒ flip, new column ⇒ its default dir. */
export function useTableSort(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  function toggle(key: string, defaultDir: SortDir = "desc") {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDir }
    );
  }
  return { sort, setSort, toggle };
}

/** Human label for the active sort, for footers ("Score", not "perfScore"). */
export function sortLabel(headers: MetricHeader[], sort: SortState): string {
  const label = headers.find((h) => h.sortKey === sort.key)?.label ?? sort.key;
  return `${label.toLowerCase()} ${sort.dir === "asc" ? "↑" : "↓"}`;
}

/** Generic comparator: numbers numerically, strings via localeCompare, null/undefined last. */
export function sortRows<T>(rows: T[], sort: SortState): T[] {
  const { key, dir } = sort;
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = (a as Record<string, unknown>)[key];
    const vb = (b as Record<string, unknown>)[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
    return String(va).localeCompare(String(vb)) * mul;
  });
}

export function MetricTable({
  headers,
  children,
  footer,
  sort,
  onSort,
}: {
  headers: MetricHeader[];
  children: React.ReactNode;
  footer?: React.ReactNode;
  sort?: SortState;
  onSort?: (key: string, defaultDir?: SortDir) => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30">
              {headers.map((h) => {
                const sortable = h.sortKey != null && onSort != null;
                const active = sortable && sort?.key === h.sortKey;
                return (
                  <th
                    key={h.label}
                    aria-sort={
                      active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
                      h.align === "right" ? "text-right" : "text-left"
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort!(h.sortKey!, h.defaultDir)}
                        className={cn(
                          "inline-flex items-center gap-1 uppercase tracking-[0.14em] transition-colors hover:text-foreground",
                          active && "text-foreground"
                        )}
                        title={`Sort by ${h.label}`}
                      >
                        {h.label}
                        <span className={cn("text-[9px]", !active && "opacity-30")}>
                          {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      h.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">{children}</tbody>
        </table>
      </div>
      {footer && (
        <div className="border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}

export const filterInputClass =
  "h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

/** Shared search field used above every metric table. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-56 flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Search
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Filter..."}
        className={filterInputClass}
      />
    </label>
  );
}

export type PositionFilter = "all" | "top3" | "top10" | "11-20" | "20+";

export const POSITION_OPTIONS: { value: PositionFilter; label: string }[] = [
  { value: "all", label: "All positions" },
  { value: "top3", label: "Top 3" },
  { value: "top10", label: "Top 10" },
  { value: "11-20", label: "11–20" },
  { value: "20+", label: "20+" },
];

export function matchesPosition(position: number, filter: PositionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "top3") return position > 0 && position <= 3;
  if (filter === "top10") return position > 0 && position <= 10;
  if (filter === "11-20") return position > 10 && position <= 20;
  return position > 20;
}

export function parseMin(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function CtrCell({ ctr }: { ctr: number }) {
  return <span className="font-data text-foreground/90">{formatCtr(ctr)}</span>;
}

export function NumCell({ value }: { value: number }) {
  return (
    <span className="font-data text-foreground/90">{value.toLocaleString()}</span>
  );
}
