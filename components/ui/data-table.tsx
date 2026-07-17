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

export function MetricTable({
  headers,
  children,
  footer,
}: {
  headers: { label: string; align?: "left" | "right" }[];
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30">
              {headers.map((h) => (
                <th
                  key={h.label}
                  className={cn(
                    "px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
                    h.align === "right" ? "text-right" : "text-left"
                  )}
                >
                  {h.label}
                </th>
              ))}
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

export function CtrCell({ ctr }: { ctr: number }) {
  return <span className="font-data text-foreground/90">{formatCtr(ctr)}</span>;
}

export function NumCell({ value }: { value: number }) {
  return (
    <span className="font-data text-foreground/90">{value.toLocaleString()}</span>
  );
}
