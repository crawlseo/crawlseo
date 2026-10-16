import type { PrismaClient } from "@prisma/client";

/**
 * Providers with a key stored per user in ApiKey. dataforseo takes a login +
 * password pair; the others take one key, stored in `encryptedPassword` with
 * `encryptedLogin` left null.
 */
export const API_KEY_PROVIDERS = ["dataforseo", "google_pagespeed", "bing"] as const;
export type ApiKeyProvider = (typeof API_KEY_PROVIDERS)[number];

export type ApiKeyStatus = Record<string, { connected: boolean; updatedAt?: string }>;

/** Which providers the user has a key for: the body of GET /api/user/api-keys. */
export async function apiKeyStatus(
  db: Pick<PrismaClient, "apiKey">,
  userId: string
): Promise<ApiKeyStatus> {
  const keys = await db.apiKey.findMany({
    where: { userId },
    select: { provider: true, updatedAt: true },
  });
  const status: ApiKeyStatus = Object.fromEntries(
    API_KEY_PROVIDERS.map((provider) => [provider, { connected: false }])
  );
  for (const key of keys) {
    status[key.provider] = { connected: true, updatedAt: key.updatedAt.toISOString() };
  }
  return status;
}
