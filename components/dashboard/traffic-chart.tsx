"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TrafficChartProps {
  siteId: string;
  days?: number;
}

interface ChartData {
  date: string;
  clicks: number;
  impressions: number;
}

function formatAxisDate(value: string) {
  const d = new Date(`${value}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TrafficChart({ siteId, days = 90 }: TrafficChartProps) {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sites/${siteId}/traffic?days=${days}`);
        if (!res.ok) throw new Error("Failed to load traffic");
        const json = (await res.json()) as ChartData[];
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load chart");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [siteId, days]);

  if (loading) {
    return (
      <div className="panel flex h-80 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading traffic…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel flex h-80 items-center justify-center">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="panel flex h-80 flex-col items-center justify-center gap-2">
        <p className="font-heading text-base font-medium text-foreground">No traffic yet</p>
        <p className="text-sm text-muted-foreground">
          Sync GSC data to populate the last {days} days.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Search traffic
          </h3>
          <p className="text-sm text-muted-foreground">
            Daily clicks & impressions · last {days} days
          </p>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full bg-signal" /> Clicks
          </span>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full bg-chart-2" /> Impressions
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="clicksFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.84 0.18 145)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="oklch(0.84 0.18 145)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="imprFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.75 0.12 220)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="oklch(0.75 0.12 220)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="oklch(0.35 0.02 250 / 0.35)" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={{ fill: "oklch(0.68 0.02 250)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            yAxisId="clicks"
            tick={{ fill: "oklch(0.68 0.02 250)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <YAxis
            yAxisId="impressions"
            orientation="right"
            tick={{ fill: "oklch(0.68 0.02 250)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "oklch(0.17 0.014 250)",
              border: "1px solid oklch(0.28 0.02 250 / 55%)",
              borderRadius: 12,
              fontSize: 12,
              boxShadow: "0 12px 40px oklch(0 0 0 / 0.4)",
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
            stroke="oklch(0.75 0.12 220)"
            fill="url(#imprFill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            yAxisId="clicks"
            type="monotone"
            dataKey="clicks"
            stroke="oklch(0.84 0.18 145)"
            fill="url(#clicksFill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
