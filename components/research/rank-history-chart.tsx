"use client";

import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RankHistoryPoint {
  date: string; // YYYY-MM-DD
  position: number;
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

export function RankHistoryChart({ data }: { data: RankHistoryPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="panel flex h-72 flex-col items-center justify-center gap-2">
        <p className="font-heading text-atom-subheader font-medium text-foreground">
          No rank history yet
        </p>
        <p className="text-atom-body text-muted-foreground">
          Position data will appear as Search Console history accumulates.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
            Rank history
          </h3>
          <p className="text-atom-caption text-muted-foreground">
            Average position &amp; clicks · last {data.length} days
          </p>
        </div>
        <div className="flex gap-4 text-atom-caption">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: PRIMARY }} /> Position
          </span>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: SIGNAL }} /> Clicks
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rankClicksFill" x1="0" y1="0" x2="0" y2="1">
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
          {/* Position axis is reversed: rank 1 sits at the top. */}
          <YAxis
            yAxisId="position"
            reversed
            domain={[1, "dataMax"]}
            allowDecimals={false}
            tick={{ fill: AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="clicks"
            orientation="right"
            tick={{ fill: AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
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
            formatter={(value, name) => {
              if (name === "position") {
                return [
                  typeof value === "number" ? value.toFixed(1) : value,
                  "Position",
                ];
              }
              return [
                typeof value === "number" ? value.toLocaleString() : value,
                "Clicks",
              ];
            }}
          />
          <Area
            yAxisId="clicks"
            type="monotone"
            dataKey="clicks"
            stroke={SIGNAL}
            fill="url(#rankClicksFill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            yAxisId="position"
            type="monotone"
            dataKey="position"
            stroke={PRIMARY}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
