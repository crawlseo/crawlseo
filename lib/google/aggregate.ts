import type { KeywordData } from "./types";

/**
 * Collapses the device/country/page slices Google returns into one row per
 * query and date.
 *
 * The API is asked for five dimensions, so a single query on a single day
 * comes back split across every device, country and landing page it appeared
 * on. The Keyword table is keyed by (site, query, date), so storing those rows
 * as they arrive lets each slice overwrite the previous one and only the last
 * survives - which silently discards most of a query's clicks.
 */
export function aggregateByQueryAndDate(rows: KeywordData[]): KeywordData[] {
  const groups = new Map<
    string,
    {
      row: KeywordData;
      weightedPosition: number;
      weight: number;
      topPageImpressions: number;
      devices: Set<string>;
      countries: Set<string>;
    }
  >();

  for (const row of rows) {
    const id = `${row.query}\u0000${row.date}`;
    const group = groups.get(id);

    if (!group) {
      groups.set(id, {
        row: { ...row, clicks: 0, impressions: 0 },
        weightedPosition: 0,
        weight: 0,
        topPageImpressions: -1,
        devices: new Set(),
        countries: new Set(),
      });
    }

    const target = groups.get(id)!;
    target.row.clicks += row.clicks;
    target.row.impressions += row.impressions;
    const weight = Math.max(row.impressions, 1);
    target.weightedPosition += row.position * weight;
    target.weight += weight;
    if (row.device) target.devices.add(row.device);
    if (row.country) target.countries.add(row.country);
    // Keep the landing page that carried the most impressions for the day.
    if (row.impressions > target.topPageImpressions) {
      target.topPageImpressions = row.impressions;
      target.row.page = row.page;
    }
  }

  return Array.from(groups.values()).map(({ row, weightedPosition, weight, devices, countries }) => ({
    ...row,
    position: Number((weightedPosition / weight).toFixed(2)),
    ctr: row.impressions > 0 ? Number((row.clicks / row.impressions).toFixed(4)) : 0,
    // The row now spans every slice, so a single device or country is only
    // reported when there genuinely was only one. Null, not undefined: on the
    // update half of an upsert Prisma reads undefined as "leave this column
    // alone", which would keep yesterday's single device on a row that has
    // since grown to cover several.
    device: devices.size === 1 ? [...devices][0] : null,
    country: countries.size === 1 ? [...countries][0] : null,
  }));
}
