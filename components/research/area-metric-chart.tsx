"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface AreaMetricPoint {
  date: string; // YYYY-MM-DD
  clicks: number;
  impressions: number;
}

function formatAxisDate(value: string) {
  const d = new Date(`${value}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const PRIMARY = "#A78BFA";
const SIGNAL = "#34D399";
const AXIS = "#71717A";
const GRID = "rgba(255,255,255,0.06)";

export function AreaMetricChart({
  data,
  title = "Search traffic",
}: {
  data: AreaMetricPoint[];
  title?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="panel flex h-72 flex-col items-center justify-center gap-2">
        <p className="font-heading text-atom-subheader font-medium text-foreground">
          No traffic yet
        </p>
        <p className="text-atom-body text-muted-foreground">
          Sync GSC data to populate this chart.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
            {title}
          </h3>
          <p className="text-atom-caption text-muted-foreground">
            Daily clicks &amp; impressions · last {data.length} days
          </p>
        </div>
        <div className="flex gap-4 text-atom-caption">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: PRIMARY }} /> Clicks
          </span>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: SIGNAL }} /> Impressions
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pgClicksFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.28} />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="pgImprFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SIGNAL} stopOpacity={0.18} />
              <stop offset="100%" stopColor={SIGNAL} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="4 6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={{ fill: AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            yAxisId="clicks"
            tick={{ fill: AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <YAxis
            yAxisId="impressions"
            orientation="right"
            tick={{ fill: AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "#161618",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              fontSize: 12,
              boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
              color: "#F4F4F5",
            }}
            labelFormatter={(label) => formatAxisDate(String(label))}
            formatter={(value, name) => [
              typeof value === "number" ? value.toLocaleString() : value,
              name === "clicks" ? "Clicks" : "Impressions",
            ]}
          />
          <Area
            yAxisId="impressions"
            type="monotone"
            dataKey="impressions"
            stroke={SIGNAL}
            fill="url(#pgImprFill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            yAxisId="clicks"
            type="monotone"
            dataKey="clicks"
            stroke={PRIMARY}
            fill="url(#pgClicksFill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
