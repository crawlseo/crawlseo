import { db } from "@/lib/db";
import { calculatePercentChange, getDateRange } from "@/lib/date-utils";

export type PeriodMetrics = {
  clicks: number;
  impressions: number;
  avgPosition: number;
  avgCtr: number;
  uniqueKeywords: number;
};

export type KeywordRow = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
};

export type PageRow = {
  url: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
};

export type DailyTraffic = {
  date: string;
  clicks: number;
  impressions: number;
};

function parseRange(days: number) {
  const { start, end } = getDateRange(days);
  return {
    start: new Date(`${start}T00:00:00.000Z`),
    end: new Date(`${end}T23:59:59.999Z`),
  };
}

function previousRange(days: number) {
  const current = parseRange(days);
  const start = new Date(current.start);
  start.setUTCDate(start.getUTCDate() - days);
  const end = new Date(current.start);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return { start, end };
}

/** Impression-weighted average position */
function weightedPosition(
  rows: { position: number; impressions: number }[]
): number {
  let weighted = 0;
  let weight = 0;
  for (const row of rows) {
    const w = Math.max(row.impressions, 0);
    weighted += row.position * w;
    weight += w;
  }
  if (weight === 0) {
    if (rows.length === 0) return 0;
    return rows.reduce((s, r) => s + r.position, 0) / rows.length;
  }
  return weighted / weight;
}

function aggregatePeriod(
  rows: { clicks: number; impressions: number; position: number; query?: string }[]
): PeriodMetrics {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const queries = new Set(rows.map((r) => r.query).filter(Boolean));
  return {
    clicks,
    impressions,
    avgPosition: weightedPosition(rows),
    avgCtr: impressions > 0 ? clicks / impressions : 0,
    uniqueKeywords: queries.size,
  };
}

export async function getSitePeriodMetrics(
  siteId: string,
  days = 28
): Promise<{
  current: PeriodMetrics;
  previous: PeriodMetrics;
  deltas: {
    clicks: number;
    impressions: number;
    avgPosition: number;
    avgCtr: number;
  };
}> {
  const currentRange = parseRange(days);
  const prevRange = previousRange(days);

  const [currentRows, previousRows] = await Promise.all([
    db.keyword.findMany({
      where: {
        siteId,
        date: { gte: currentRange.start, lte: currentRange.end },
      },
      select: {
        query: true,
        clicks: true,
        impressions: true,
        position: true,
      },
    }),
    db.keyword.findMany({
      where: {
        siteId,
        date: { gte: prevRange.start, lte: prevRange.end },
      },
      select: {
        query: true,
        clicks: true,
        impressions: true,
        position: true,
      },
    }),
  ]);

  const current = aggregatePeriod(currentRows);
  const previous = aggregatePeriod(previousRows);

  return {
    current,
    previous,
    deltas: {
      clicks: calculatePercentChange(current.clicks, previous.clicks),
      impressions: calculatePercentChange(
        current.impressions,
        previous.impressions
      ),
      // Positive delta = improved (lower position is better)
      avgPosition: previous.avgPosition - current.avgPosition,
      avgCtr: calculatePercentChange(current.avgCtr, previous.avgCtr),
    },
  };
}

/** Aggregate keyword rows across the period (sum metrics, weighted position). */
export async function getTopKeywords(
  siteId: string,
  days = 28,
  limit = 50
): Promise<KeywordRow[]> {
  const range = parseRange(days);
  const rows = await db.keyword.findMany({
    where: {
      siteId,
      date: { gte: range.start, lte: range.end },
    },
    select: {
      query: true,
      clicks: true,
      impressions: true,
      position: true,
    },
  });

  const byQuery = new Map<
    string,
    { clicks: number; impressions: number; weightedPos: number }
  >();

  for (const row of rows) {
    const existing = byQuery.get(row.query) ?? {
      clicks: 0,
      impressions: 0,
      weightedPos: 0,
    };
    existing.clicks += row.clicks;
    existing.impressions += row.impressions;
    existing.weightedPos += row.position * Math.max(row.impressions, 1);
    byQuery.set(row.query, existing);
  }

  return Array.from(byQuery.entries())
    .map(([query, data]) => {
      const weight = Math.max(data.impressions, 1);
      const position = data.weightedPos / weight;
      const ctr = data.impressions > 0 ? data.clicks / data.impressions : 0;
      return {
        query,
        clicks: data.clicks,
        impressions: data.impressions,
        position,
        ctr,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

export async function getTopPages(
  siteId: string,
  days = 28,
  limit = 50
): Promise<PageRow[]> {
  const range = parseRange(days);
  const rows = await db.page.findMany({
    where: {
      siteId,
      date: { gte: range.start, lte: range.end },
    },
    select: {
      url: true,
      clicks: true,
      impressions: true,
      position: true,
    },
  });

  const byUrl = new Map<
    string,
    { clicks: number; impressions: number; weightedPos: number }
  >();

  for (const row of rows) {
    const existing = byUrl.get(row.url) ?? {
      clicks: 0,
      impressions: 0,
      weightedPos: 0,
    };
    existing.clicks += row.clicks;
    existing.impressions += row.impressions;
    existing.weightedPos += row.position * Math.max(row.impressions, 1);
    byUrl.set(row.url, existing);
  }

  return Array.from(byUrl.entries())
    .map(([url, data]) => {
      const weight = Math.max(data.impressions, 1);
      const position = data.weightedPos / weight;
      const ctr = data.impressions > 0 ? data.clicks / data.impressions : 0;
      return {
        url,
        clicks: data.clicks,
        impressions: data.impressions,
        position,
        ctr,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

export async function getDailyTraffic(
  siteId: string,
  days = 90
): Promise<DailyTraffic[]> {
  const range = parseRange(days);

  // Prefer page-level rows when present (cleaner site totals);
  // fall back to keyword rows.
  const pages = await db.page.findMany({
    where: {
      siteId,
      date: { gte: range.start, lte: range.end },
    },
    select: { date: true, clicks: true, impressions: true },
    orderBy: { date: "asc" },
  });

  const source =
    pages.length > 0
      ? pages
      : await db.keyword.findMany({
          where: {
            siteId,
            date: { gte: range.start, lte: range.end },
          },
          select: { date: true, clicks: true, impressions: true },
          orderBy: { date: "asc" },
        });

  const aggregated = new Map<string, { clicks: number; impressions: number }>();

  for (const row of source) {
    const dateStr = row.date.toISOString().slice(0, 10);
    const current = aggregated.get(dateStr) ?? { clicks: 0, impressions: 0 };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    aggregated.set(dateStr, current);
  }

  return Array.from(aggregated.entries())
    .map(([date, metrics]) => ({ date, ...metrics }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function formatPosition(position: number): string {
  if (!Number.isFinite(position) || position <= 0) return "—";
  return position.toFixed(1);
}

export function formatCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(2)}%`;
}

export function formatCompact(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function positionBand(position: number): "top3" | "top10" | "top20" | "deep" {
  if (position > 0 && position <= 3) return "top3";
  if (position <= 10) return "top10";
  if (position <= 20) return "top20";
  return "deep";
}
