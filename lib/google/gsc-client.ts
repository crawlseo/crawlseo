import { db } from "@/lib/db";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokens {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

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

export interface KeywordData {
  query: string;
  page?: string;
  device?: string;
  country?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date: string;
}

/**
 * Refreshes Google OAuth tokens if expired
 */
async function refreshAccessToken(
  refreshToken: string
): Promise<{
  accessToken: string;
  expiresAt: number;
}> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Failed to refresh token: ${response.status} ${response.statusText}${
        body ? ` — ${body.slice(0, 500)}` : ""
      }`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Gets a valid access token for a user, refreshing if necessary
 */
async function getAccessToken(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { googleTokens: true },
  });

  if (!user?.googleTokens) {
    throw new Error("User has no Google OAuth tokens");
  }

  const tokens = user.googleTokens as unknown as GoogleTokens;

  // If token expired or expiring soon (within 5 minutes), refresh it
  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new Error("Missing required Google OAuth tokens");
  }

  if (!tokens.expiresAt || tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    const { accessToken, expiresAt } = await refreshAccessToken(
      tokens.refreshToken
    );

    // Update tokens in database
    await db.user.update({
      where: { id: userId },
      data: {
        googleTokens: {
          ...tokens,
          accessToken,
          expiresAt,
        },
      },
    });

    return accessToken;
  }

  return tokens.accessToken;
}

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

  return results;
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
