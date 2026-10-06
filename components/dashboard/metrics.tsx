import { getSitePeriodMetrics, formatCompact, formatCtr } from "@/lib/seo-metrics";
import { signed } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MetricsProps {
  siteId: string;
  days?: number;
}

/**
 * KPI card from the Overview board: label, mono value, and the change as a
 * one-line mono uppercase value. The page meta line already says which two
 * periods are compared, so the delta carries no words beyond its unit.
 */
function MetricCard({
  label,
  value,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  /** Positive is better. */
  delta: number;
  deltaLabel: string;
}) {
  const isFlat = !Number.isFinite(delta) || Math.abs(delta) < 0.05;

  return (
    <div className="panel flex min-w-0 flex-col gap-2 px-5 py-[18px]">
      <p className="text-[13px] leading-5 text-muted-foreground">{label}</p>
      <p className="font-data text-[30px] leading-9 font-medium tracking-[-0.02em] text-text-strong">
        {value}
      </p>
      <p
        className={cn(
          "mono-label truncate text-[12px] leading-4 whitespace-nowrap",
          isFlat ? "text-muted-foreground" : delta > 0 ? "text-success" : "text-danger"
        )}
      >
        {isFlat ? "No change" : deltaLabel}
      </p>
    </div>
  );
}

export async function DashboardMetrics({ siteId, days = 28 }: MetricsProps) {
  const { current, previous, deltas } = await getSitePeriodMetrics(siteId, days);
  // CTR moves in percentage points, not as a percent of itself.
  const ctrPoints = (current.avgCtr - previous.avgCtr) * 100;

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Clicks"
        value={formatCompact(current.clicks)}
        delta={deltas.clicks}
        deltaLabel={`${signed(deltas.clicks)}%`}
      />
      <MetricCard
        label="Impressions"
        value={formatCompact(current.impressions)}
        delta={deltas.impressions}
        deltaLabel={`${signed(deltas.impressions)}%`}
      />
      <MetricCard
        label="Average position"
        value={current.avgPosition > 0 ? current.avgPosition.toFixed(1) : "n/a"}
        delta={deltas.avgPosition}
        deltaLabel={`${signed(deltas.avgPosition)} places`}
      />
      <MetricCard
        label="CTR"
        value={formatCtr(current.avgCtr)}
        delta={ctrPoints}
        deltaLabel={`${signed(ctrPoints)} pt`}
      />
    </div>
  );
}
