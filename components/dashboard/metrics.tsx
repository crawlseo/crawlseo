import { db } from "@/lib/db";
import { getDateRange, calculatePercentChange } from "@/lib/date-utils";

interface MetricsProps {
  siteId: string;
}

export async function DashboardMetrics({ siteId }: MetricsProps) {
  // Get current period (28 days)
  const { start: currentStart, end: currentEnd } = getDateRange(28);
  const currentStartDate = new Date(currentStart);
  const currentEndDate = new Date(currentEnd);

  // Get previous period (28 days before)
  const previousStart = new Date(currentStartDate);
  previousStart.setDate(previousStart.getDate() - 28);
  const previousStartDate = new Date(previousStart);
  previousStartDate.setDate(previousStartDate.getDate() - 28);

  // Fetch current period keywords
  const currentKeywords = await db.keyword.findMany({
    where: {
      siteId,
      date: {
        gte: currentStartDate,
        lte: currentEndDate,
      },
    },
    select: {
      clicks: true,
      impressions: true,
      position: true,
    },
  });

  // Fetch previous period keywords
  const previousKeywords = await db.keyword.findMany({
    where: {
      siteId,
      date: {
        gte: previousStartDate,
        lt: currentStartDate,
      },
    },
    select: {
      clicks: true,
      impressions: true,
      position: true,
    },
  });

  // Calculate metrics
  const currentClicks = currentKeywords.reduce(
    (sum, k) => sum + k.clicks,
    0
  );
  const currentImpressions = currentKeywords.reduce(
    (sum, k) => sum + k.impressions,
    0
  );
  const currentAvgPosition =
    currentKeywords.length > 0
      ? currentKeywords.reduce((sum, k) => sum + k.position, 0) /
        currentKeywords.length
      : 0;

  const previousClicks = previousKeywords.reduce(
    (sum, k) => sum + k.clicks,
    0
  );
  const previousImpressions = previousKeywords.reduce(
    (sum, k) => sum + k.impressions,
    0
  );
  const previousAvgPosition =
    previousKeywords.length > 0
      ? previousKeywords.reduce((sum, k) => sum + k.position, 0) /
        previousKeywords.length
      : 0;

  // Calculate percent changes
  const clicksChange = calculatePercentChange(currentClicks, previousClicks);
  const impressionsChange = calculatePercentChange(
    currentImpressions,
    previousImpressions
  );
  const positionChange = previousAvgPosition - currentAvgPosition; // Lower is better

  const MetricCard = ({
    label,
    value,
    change,
    format,
  }: {
    label: string;
    value: number | string;
    change: number;
    format?: (v: number) => string;
  }) => {
    const isPositive = change > 0;
    const changeStr = format ? format(change) : `${change > 0 ? "+" : ""}${change}`;

    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">
          {label}
        </p>
        <div className="mt-2 flex items-baseline justify-between">
          <p className="text-3xl font-bold text-slate-900">{value}</p>
          <div
            className={`text-sm font-semibold ${
              isPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {isPositive ? "↑" : "↓"} {changeStr}
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          vs last 28 days
        </p>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard
        label="Total Clicks"
        value={currentClicks.toLocaleString()}
        change={clicksChange}
      />
      <MetricCard
        label="Total Impressions"
        value={currentImpressions.toLocaleString()}
        change={impressionsChange}
      />
      <MetricCard
        label="Avg Position"
        value={currentAvgPosition.toFixed(1)}
        change={positionChange}
        format={(v) => {
          const formatted = Math.abs(v).toFixed(1);
          return `${v > 0 ? "-" : "+"}${formatted}`;
        }}
      />
      <MetricCard
        label="Keywords Tracked"
        value={currentKeywords.length}
        change={0}
      />
    </div>
  );
}
