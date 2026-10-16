import { Prisma, type PrismaClient } from "@prisma/client";
import { ACTIVE_CRAWL_STATUSES, stopCrawls } from "@/lib/crawler/lifecycle";
import { openGoogleTokens } from "@/lib/google/token-store";

/*
 * Account actions: disconnect Google and delete the account. Both act on the
 * user id the caller got from the session; app/(dashboard)/settings/actions.ts
 * is the only caller and never takes an id from the request.
 */

export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

type Db = Pick<PrismaClient, "user" | "account" | "crawl" | "session">;

export type RevokeResult = { revoked: boolean };

/**
 * The token to revoke: the refresh token (revoking it ends the access tokens
 * issued from it too), else the access token. Older rows may still hold them
 * on the Account row only.
 */
async function googleTokenToRevoke(db: Db, userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { googleTokens: true } });
  let stored: ReturnType<typeof openGoogleTokens> = null;
  try {
    stored = openGoogleTokens(user?.googleTokens);
  } catch {
    // Unreadable (secret changed): fall back to the Account row.
  }
  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true },
  });
  return (
    stored?.refreshToken ??
    account?.refresh_token ??
    stored?.accessToken ??
    account?.access_token ??
    null
  );
}

/** Asks Google to revoke the token. Never throws: a failure is reported, not fatal. */
export async function revokeGoogleToken(token: string | null): Promise<RevokeResult> {
  if (!token) return { revoked: false };
  try {
    const res = await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });
    return { revoked: res.ok };
  } catch {
    return { revoked: false };
  }
}

/**
 * Revokes the Google grant, forgets the tokens (`User.googleTokens` and the
 * token columns of the Google Account row) and ends every session of the user,
 * so no other browser keeps working without tokens. The Account row is kept, so
 * the user can sign in again with DISABLE_REGISTRATION=true (lib/registration.ts).
 * The local tokens are cleared even when Google could not be reached.
 */
export async function disconnectGoogle(db: Db, userId: string): Promise<RevokeResult> {
  const result = await revokeGoogleToken(await googleTokenToRevoke(db, userId));
  await db.user.update({ where: { id: userId }, data: { googleTokens: Prisma.DbNull } });
  await db.account.updateMany({
    where: { userId, provider: "google" },
    data: { access_token: null, refresh_token: null, id_token: null, expires_at: null },
  });
  await db.session.deleteMany({ where: { userId } });
  return result;
}

/**
 * Deletes the user and everything they own. Revokes the Google grant first,
 * then stops the user's crawls running in this process, then deletes the User
 * row: every user-owned table (accounts, sessions, API keys, alerts, sites and
 * all site data) cascades from it.
 */
export async function deleteAccount(db: Db, userId: string): Promise<RevokeResult> {
  const result = await revokeGoogleToken(await googleTokenToRevoke(db, userId));

  const active = await db.crawl.findMany({
    where: { site: { userId }, status: { in: ACTIVE_CRAWL_STATUSES } },
    select: { id: true },
  });
  stopCrawls(
    active.map((c) => c.id),
    "Stopped: the account was deleted"
  );

  await db.user.delete({ where: { id: userId } });
  return result;
}
