import { getAccessToken } from "./google-auth";
import { aggregateByQueryAndDate } from "./aggregate";
import type { KeywordData } from "./types";
export type { KeywordData } from "./types";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";

interface GSCProperty {
  siteUrl: string;
  permissionLevel: string;
}

interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type GSCFilter = {
  dimension: 'query' | 'page' | 'device' | 'country';
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains';
  expression: string;
};


/**
 * Lists all Google Search Console properties for a user
 */
export async function listGSCProperties(
  userId: string
): Promise<GSCProperty[]> {
  const accessToken = await getAccessToken(userId);

  const response = await fetch(`${GSC_API_BASE}/sites`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to list GSC properties: ${response.status} ${response.statusText}${
        body ? ` — ${body.slice(0, 500)}` : ""
      }`
    );
  }

  const data = (await response.json()) as { siteEntry?: GSCProperty[] };

  return data.siteEntry || [];
}

/**
 * Fetches search analytics data from Google Search Console
 */
export async function fetchSearchAnalytics(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[] = ["query", "page", "date", "device", "country"],
  filters?: GSCFilter[]
): Promise<KeywordData[]> {
  const accessToken = await getAccessToken(userId);

  const results: KeywordData[] = [];
  let startRow = 0;
  const rowLimit = 25000; // GSC limit per request

  // Paginate through all results
  while (true) {
    const response = await fetch(
      `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions,
          rowLimit,
          startRow,
          ...(filters?.length && {
            dimensionFilterGroups: [{ filters }],
          }),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch search analytics: ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      rows?: SearchAnalyticsRow[];
    };

    if (!data.rows || data.rows.length === 0) {
      break;
    }

    // Parse rows and map to KeywordData
    for (const row of data.rows) {
      const [query, page, date, device, country] = row.keys;

      results.push({
        query,
        page,
        device,
        country,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr.toFixed(4)),
        position: Number(row.position.toFixed(2)),
        date,
      });
    }


    // If we got fewer rows than requested, we've reached the end
    if (data.rows.length < rowLimit) {
      break;
    }

    startRow += rowLimit;
  }

  return aggregateByQueryAndDate(results);
}

/**
 * Fetches search analytics aggregated by page
 */
export async function fetchPageAnalytics(
  userId: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<KeywordData[]> {
  const accessToken = await getAccessToken(userId);

  const response = await fetch(
    `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page", "date"],
        rowLimit: 25000,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch page analytics: ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    rows?: SearchAnalyticsRow[];
  };

  const results: KeywordData[] = [];

  if (data.rows) {
    for (const row of data.rows) {
      const [page, date] = row.keys;

      results.push({
        query: "", // Page data doesn't have queries
        page,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number(row.ctr.toFixed(4)),
        position: Number(row.position.toFixed(2)),
        date,
      });
    }
  }

  return results;
}
