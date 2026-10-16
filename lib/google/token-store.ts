import type { Prisma, PrismaClient } from "@prisma/client";
import { decrypt, encrypt } from "@/lib/encryption";

/**
 * Google OAuth tokens as the app uses them. In `User.googleTokens` the access
 * and refresh tokens are stored encrypted with lib/encryption.ts, each with
 * the ENCRYPTED_PREFIX; the other fields are not secret and stay readable.
 * Rows written before encryption hold the tokens in plain text: they are still
 * read, and written back encrypted on the next token refresh or by
 * scripts/encrypt-google-tokens.ts.
 */
export interface GoogleTokens {
  accessToken?: string;
  refreshToken?: string;
  /** Unix milliseconds. */
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

export const ENCRYPTED_PREFIX = "enc:v1:";

const SECRET_FIELDS = ["accessToken", "refreshToken"] as const;

function seal(value: string): string {
  return value.startsWith(ENCRYPTED_PREFIX) ? value : ENCRYPTED_PREFIX + encrypt(value);
}

function open(value: string): string {
  return value.startsWith(ENCRYPTED_PREFIX) ? decrypt(value.slice(ENCRYPTED_PREFIX.length)) : value;
}

function asObject(stored: unknown): Record<string, unknown> | null {
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? (stored as Record<string, unknown>)
    : null;
}

/** The value to write to `User.googleTokens`: tokens encrypted, undefined fields left out. */
export function sealGoogleTokens(tokens: GoogleTokens): Prisma.InputJsonObject {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (value === undefined || value === null) continue;
    out[key] = (SECRET_FIELDS as readonly string[]).includes(key) ? seal(String(value)) : value;
  }
  return out;
}

/** `User.googleTokens` as stored, encrypted or legacy plain text, with the tokens readable. */
export function openGoogleTokens(stored: unknown): GoogleTokens | null {
  const obj = asObject(stored);
  if (!obj) return null;
  const tokens: GoogleTokens = { ...(obj as GoogleTokens) };
  for (const key of SECRET_FIELDS) {
    const value = obj[key];
    if (typeof value === "string") tokens[key] = open(value);
  }
  return tokens;
}

/** True when every token in the stored value is encrypted (or there is none). */
export function isSealed(stored: unknown): boolean {
  const obj = asObject(stored);
  if (!obj) return true;
  return SECRET_FIELDS.every((key) => {
    const value = obj[key];
    return typeof value !== "string" || value.startsWith(ENCRYPTED_PREFIX);
  });
}

type SignInAccount = {
  provider: string;
  providerAccountId: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
};

/**
 * After a Google sign-in: keeps the tokens in `User.googleTokens`, encrypted,
 * and clears the plain-text copies the Prisma adapter wrote to the Account
 * row. The Account row itself stays: it is how a returning user is recognised
 * (lib/registration.ts). Nothing reads the tokens from the Account row.
 */
export async function storeSignInTokens(
  db: Pick<PrismaClient, "user" | "account">,
  email: string,
  account: SignInAccount
): Promise<void> {
  await db.user.update({
    where: { email },
    data: {
      googleTokens: sealGoogleTokens({
        accessToken: account.access_token,
        refreshToken: account.refresh_token,
        // account.expires_at is Unix seconds; store ms to match
        // refreshAccessToken() and getAccessToken()'s Date.now() checks.
        expiresAt: account.expires_at ? account.expires_at * 1000 : undefined,
        tokenType: account.token_type,
        scope: account.scope,
      }),
    },
  });
  await db.account.updateMany({
    where: { provider: account.provider, providerAccountId: account.providerAccountId },
    data: { access_token: null, refresh_token: null },
  });
}
