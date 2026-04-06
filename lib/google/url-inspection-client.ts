import { db } from "@/lib/db";

const URL_INSPECTION_API_BASE =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

interface GoogleTokens {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
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
  const response = await fetch("https://oauth2.googleapis.com/token", {
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
    throw new Error(`Failed to refresh token: ${response.statusText}`);
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

  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new Error("Missing required Google OAuth tokens");
  }

  if (!tokens.expiresAt || tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    const { accessToken, expiresAt } = await refreshAccessToken(
      tokens.refreshToken
    );

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

export interface UrlInspectionResult {
  url: string;
  inspectionResult: {
    indexStatusResult?: {
      coverageState: string;
      robotsTexted: boolean;
      robotsAllowed: boolean;
      indexingState: string;
      lastCrawlTime?: string;
      pagesFetched?: number;
      pageFetchedGoogleBot?: number;
      pageIndexed?: boolean;
    };
    mobileUsabilityResult?: {
      mobileFriendliness: string;
      issues: Array<{
        rule: string;
        issueCode: string;
      }>;
    };
  };
}

/**
 * Inspects a URL to check its index status
 */
export async function inspectUrl(
  userId: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<UrlInspectionResult> {
  const accessToken = await getAccessToken(userId);

  const response = await fetch(URL_INSPECTION_API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inspectionUrl,
      siteUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to inspect URL: ${response.statusText} - ${error}`
    );
  }

  const data = (await response.json()) as UrlInspectionResult;

  return data;
}

/**
 * Checks if a URL is indexed in Google
 */
export async function isUrlIndexed(
  userId: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<boolean> {
  try {
    const result = await inspectUrl(userId, siteUrl, inspectionUrl);

    const coverage = result.inspectionResult?.indexStatusResult?.coverageState;

    return (
      coverage === "Indexed" ||
      coverage === "Submitted, but not indexed" ||
      coverage === "Crawled - not indexed"
    );
  } catch {
    // If inspection fails, assume not indexed
    return false;
  }
}

/**
 * Gets the index status for a URL
 */
export async function getIndexStatus(
  userId: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<string | null> {
  try {
    const result = await inspectUrl(userId, siteUrl, inspectionUrl);
    return result.inspectionResult?.indexStatusResult?.coverageState || null;
  } catch {
    return null;
  }
}
