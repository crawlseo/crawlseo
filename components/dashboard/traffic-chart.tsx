"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDay } from "@/lib/format";

interface TrafficChartProps {
  siteId: string;
  days?: number;
}

interface ChartData {
  date: string;
  clicks: number;
  impressions: number;
}

type Day = { date: string; clicks: number | null; impressions: number | null };


/** Every calendar day from the first synced day to today; days GSC has not reported stay null. */
function fillDays(data: ChartData[]): Day[] {
  if (data.length === 0) return [];
  const byDate = new Map(data.map((d) => [d.date, d]));
  const out: Day[] = [];
  const end = new Date().toISOString().slice(0, 10);
  for (
    let t = Date.parse(`${data[0].date}T00:00:00Z`);
    new Date(t).toISOString().slice(0, 10) <= end;
    t += 86_400_000
  ) {
    const date = new Date(t).toISOString().slice(0, 10);
    const row = byDate.get(date);
    out.push({ date, clicks: row?.clicks ?? null, impressions: row?.impressions ?? null });
  }
  return out;
}

/**
 * Clicks per day as bars, as on the Overview board. A day Search Console has
 * not reported yet is an empty dashed bar, never a zero.
 */
export function TrafficChart({ siteId, days = 90 }: TrafficChartProps) {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

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

  const series = useMemo(() => fillDays(data), [data]);
  const max = Math.max(1, ...series.map((d) => d.clicks ?? 0));
  const missing = series.filter((d) => d.clicks === null).length;

  if (loading) {
    return (
      <div className="panel flex h-[262px] items-center justify-center">
        <p className="text-atom-body text-muted-foreground">Loading traffic…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel flex h-[262px] items-center justify-center">
        <p className="text-atom-body text-danger">{error}</p>
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="panel flex h-[262px] flex-col items-center justify-center gap-2">
        <p className="text-atom-subheader font-medium text-text-strong">No traffic yet</p>
        <p className="text-atom-body text-muted-foreground">
          Sync GSC data to populate the last {days} days.
        </p>
      </div>
    );
  }

  const shown = hover !== null ? series[hover] : null;
  const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1];

  return (
    <section className="panel flex flex-col gap-4 px-[22px] py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] leading-5 font-semibold">Clicks per day</h2>
        <div className="flex flex-wrap gap-[18px] text-[12px] leading-4 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-chart-1" />
            Synced
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[2px] border border-dashed border-text-soft" />
            Not in GSC yet, not a zero
          </span>
        </div>
      </div>

      <div
        role="img"
        aria-label={`Clicks per day, ${formatDay(series[0].date)} to ${formatDay(series[series.length - 1].date)}. Highest day ${max.toLocaleString()} clicks. ${missing} days not reported by Search Console yet.`}
        className="flex h-[170px] items-end gap-[3px] border-b border-border sm:gap-1.5"
        onMouseLeave={() => setHover(null)}
      >
        {series.map((d, i) => (
          <div
            key={d.date}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
            onMouseEnter={() => setHover(i)}
          >
            {d.clicks === null ? (
              <div className="h-[160px] w-full max-w-2.5 rounded-t-[2px] border border-b-0 border-dashed border-text-soft" />
            ) : (
              <div
                className="w-full max-w-2.5 rounded-t-[2px] bg-chart-1 transition-opacity"
                style={{
                  height: `${Math.max(1, Math.round((d.clicks / max) * 160))}px`,
                  opacity: hover === null || hover === i ? 1 : 0.55,
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] leading-4 text-muted-foreground">
        {shown ? (
          <span className="mono-label">
            {formatDay(shown.date)} ·{" "}
            {shown.clicks === null
              ? "not in GSC yet"
              : `${shown.clicks.toLocaleString()} clicks · ${shown.impressions?.toLocaleString()} impressions`}
          </span>
        ) : (
          ticks.map((i) => (
            <span key={i} className="mono-label">
              {formatDay(series[i].date)}
            </span>
          ))
        )}
      </div>
    </section>
  );
}
