/**
 * Pure parsing helpers for the Bing Webmaster Tools JSON API.
 * Kept free of database imports so they can be unit tested on their own.
 */

/**
 * One weekly bucket for a query or a page. Bing reports both through the same
 * QueryStats contract - for GetPageStats the URL arrives in the `Query` field.
 */
export interface BingSearchWeek {
  key: string;
  weekEnding: string; // YYYY-MM-DD (a Friday)
  clicks: number;
  impressions: number;
  avgImpressionPosition: number | null;
}

export interface RawQueryStats {
  Query: string;
  Date: string;
  Clicks: number;
  Impressions: number;
  AvgImpressionPosition?: number;
}

/**
 * Bing serialises dates as .NET strings: `/Date(1747983600000-0700)/`.
 *
 * The epoch is midnight in the trailing offset's timezone, so the offset has
 * to be added back before formatting. Bing's own offsets are negative, where
 * reading the epoch as UTC happens to land on the right day anyway - but a
 * positive offset puts local midnight before UTC midnight and would report
 * the previous day, shifting every weekly bucket by one.
 */
export function parseBingDate(value: string): string {
  const match = /\/Date\((-?\d+)([+-]\d{4})?\)/.exec(value);
  if (!match) throw new Error(`Unparseable Bing date: ${value}`);

  const offsetMinutes = match[2]
    ? (match[2][0] === "-" ? -1 : 1) *
      (Number(match[2].slice(1, 3)) * 60 + Number(match[2].slice(3)))
    : 0;

  return new Date(Number(match[1]) + offsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Bing sends -1 for AvgClickPosition when the row had no clicks at all.
 * That is a sentinel, not a position - averaging it produces negative ranks.
 */
export function normalisePosition(value: unknown): number | null {
  return typeof value === "number" && value > 0 ? value : null;
}

/**
 * Collapses raw rows to one record per (key, week), summing volume and
 * weighting positions by impressions. Bing can repeat a key inside a bucket;
 * writing rows straight through would let the last one overwrite the rest.
 */
export function aggregateWeekly(rows: RawQueryStats[]): BingSearchWeek[] {
  const byKey = new Map<
    string,
    BingSearchWeek & { impWeight: number }
  >();

  for (const row of rows) {
    if (!row?.Query || !row?.Date) continue;
    const weekEnding = parseBingDate(row.Date);
    const id = `${row.Query} ${weekEnding}`;
    const clicks = row.Clicks ?? 0;
    const impressions = row.Impressions ?? 0;
    const impPos = normalisePosition(row.AvgImpressionPosition);

    const entry = byKey.get(id) ?? {
      key: row.Query,
      weekEnding,
      clicks: 0,
      impressions: 0,
      avgImpressionPosition: null,
      impWeight: 0,
    };

    entry.clicks += clicks;
    entry.impressions += impressions;
    if (impPos !== null) {
      const weight = Math.max(impressions, 1);
      entry.avgImpressionPosition =
        (entry.avgImpressionPosition ?? 0) + impPos * weight;
      entry.impWeight += weight;
    }

    byKey.set(id, entry);
  }

  return Array.from(byKey.values()).map((entry) => ({
    key: entry.key,
    weekEnding: entry.weekEnding,
    clicks: entry.clicks,
    impressions: entry.impressions,
    avgImpressionPosition:
      entry.avgImpressionPosition !== null && entry.impWeight > 0
        ? Number((entry.avgImpressionPosition / entry.impWeight).toFixed(2))
        : null,
  }));
}

/**
 * Weekly buckets that fall inside a day-based window, collapsed per key.
 * A bucket counts when its week-ending date is inside the window, so the
 * edges are approximate by up to six days - Bing offers no finer grain.
 */
export function collapseWeeks(
  rows: BingSearchWeek[]
): Array<{
  key: string;
  clicks: number;
  impressions: number;
  position: number | null;
  ctr: number;
}> {
  const byKey = new Map<
    string,
    { clicks: number; impressions: number; weighted: number; weight: number }
  >();

  for (const row of rows) {
    const entry = byKey.get(row.key) ?? {
      clicks: 0,
      impressions: 0,
      weighted: 0,
      weight: 0,
    };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    if (row.avgImpressionPosition !== null) {
      const weight = Math.max(row.impressions, 1);
      entry.weighted += row.avgImpressionPosition * weight;
      entry.weight += weight;
    }
    byKey.set(row.key, entry);
  }

  return Array.from(byKey.entries())
    .map(([key, entry]) => ({
      key,
      clicks: entry.clicks,
      impressions: entry.impressions,
      position:
        entry.weight > 0 ? Number((entry.weighted / entry.weight).toFixed(1)) : null,
      ctr: entry.impressions > 0 ? entry.clicks / entry.impressions : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}
