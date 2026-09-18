import { db } from "@/lib/db";
import {
  getServiceAccountAccessToken,
  isServiceAccountConfigured,
} from "./service-account";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokens {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export class ReauthRequiredError extends Error {
  constructor() {
    super("Your Google connection has expired. Please reconnect your account.");
    this.name = "ReauthRequiredError";
  }
}

/**
 * Refreshes Google OAuth tokens if expired.
 * Throws ReauthRequiredError when the refresh token itself is invalid/expired.
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
    if (body.includes("invalid_grant")) {
      throw new ReauthRequiredError();
    }
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
 * Gets a valid access token for a user, refreshing if necessary.
 *
 * When a service account is configured (GOOGLE_SERVICE_ACCOUNT_KEY), it takes
 * precedence and `userId` is unused: the credential belongs to the deployment,
 * not to a person, which is the whole point — no consent screen, no test-user
 * list, no re-consent when a refresh token dies. See ./service-account.
 *
 * Precedence is deliberate rather than a fallback. Falling back on error would
 * mean a broken service account silently resumes acting as whichever user
 * happened to connect last, and the logs would show success.
 */
export async function getAccessToken(userId: string): Promise<string> {
  if (isServiceAccountConfigured()) {
    return getServiceAccountAccessToken();
  }

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
