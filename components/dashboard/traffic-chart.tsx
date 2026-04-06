"use client";

import { db } from "@/lib/db";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { getDateRange } from "@/lib/date-utils";
import { useEffect, useState } from "react";

interface TrafficChartProps {
  siteId: string;
}

interface ChartData {
  date: string;
  clicks: number;
  impressions: number;
}

export function TrafficChart({ siteId }: TrafficChartProps) {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const { start, end } = getDateRange(90);
        const startDate = new Date(start);
        const endDate = new Date(end);

        // Note: In production, this would be an API call
        // For now we're using client-side data loading
        const keywords = await db.keyword.findMany({
          where: {
            siteId,
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: {
            date: true,
            clicks: true,
            impressions: true,
          },
          orderBy: { date: "asc" },
        });

        // Aggregate by date
        const aggregated = new Map<string, { clicks: number; impressions: number }>();

        for (const keyword of keywords) {
          const dateStr = keyword.date.toISOString().split("T")[0];
          if (!aggregated.has(dateStr)) {
            aggregated.set(dateStr, { clicks: 0, impressions: 0 });
          }
          const current = aggregated.get(dateStr)!;
          current.clicks += keyword.clicks;
          current.impressions += keyword.impressions;
        }

        const chartData = Array.from(aggregated.entries()).map(([date, metrics]) => ({
          date,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
        }));

        setData(chartData);
      } catch (error) {
        console.error("Failed to load chart data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [siteId]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 h-80 flex items-center justify-center">
        <p className="text-slate-600">Loading chart...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 h-80 flex items-center justify-center">
        <p className="text-slate-600">No data available for chart</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">
        Traffic Over Time (Last 90 Days)
      </h3>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            stroke="#94a3b8"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#94a3b8"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "12px",
            }}
            formatter={(value) => {
              if (typeof value === "number") {
                return value.toLocaleString();
              }
              return value;
            }}
          />
          <Legend
            wrapperStyle={{ paddingTop: "20px" }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="clicks"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            name="Clicks"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="impressions"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={false}
            name="Impressions"
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
