import { Prisma, type PrismaClient } from "@prisma/client";
import { isSealed, openGoogleTokens, sealGoogleTokens } from "@/lib/google/token-store";

/*
 * One-off migration behind scripts/encrypt-google-tokens.ts: encrypts the
 * Google tokens of rows written before they were stored encrypted, and clears
 * the plain-text copies on Google Account rows. Idempotent: encrypted rows and
 * cleared Account rows are left alone. Reports counts only, never a token.
 */

export type EncryptReport = {
  /** Users with stored Google tokens. */
  users: number;
  /** Of those, users whose tokens were (or, in a dry run, would be) encrypted. */
  plainUsers: number;
  /** Google Account rows still holding an access or refresh token. */
  accountsWithTokens: number;
  /** Of those, rows whose tokens were (or would be) cleared: the user has a refresh token in googleTokens. */
  accountsCleared: number;
  /** Rows left as they are: the user has no refresh token in googleTokens, so this is the only copy. */
  accountsKept: number;
  applied: boolean;
};

export async function encryptStoredGoogleTokens(
  db: Pick<PrismaClient, "user" | "account">,
  { apply }: { apply: boolean }
): Promise<EncryptReport> {
  const users = await db.user.findMany({
    where: { googleTokens: { not: Prisma.DbNull } },
    select: { id: true, googleTokens: true },
  });

  const hasRefreshToken = new Set<string>();
  let plainUsers = 0;
  for (const user of users) {
    const stored = user.googleTokens as { refreshToken?: unknown } | null;
    // Checked without decrypting, so a row this secret cannot read stops nothing.
    if (typeof stored?.refreshToken === "string" && stored.refreshToken) hasRefreshToken.add(user.id);
    if (isSealed(user.googleTokens)) continue;
    plainUsers++;
    const tokens = openGoogleTokens(user.googleTokens);
    if (apply && tokens) {
      await db.user.update({ where: { id: user.id }, data: { googleTokens: sealGoogleTokens(tokens) } });
    }
  }

  const accounts = await db.account.findMany({
    where: { provider: "google", OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }] },
    select: { id: true, userId: true },
  });
  const clear = accounts.filter((a) => hasRefreshToken.has(a.userId));
  if (apply && clear.length) {
    await db.account.updateMany({
      where: { id: { in: clear.map((a) => a.id) } },
      data: { access_token: null, refresh_token: null },
    });
  }

  return {
    users: users.length,
    plainUsers,
    accountsWithTokens: accounts.length,
    accountsCleared: clear.length,
    accountsKept: accounts.length - clear.length,
    applied: apply,
  };
}

/** What scripts/encrypt-google-tokens.ts prints: counts only. */
export function reportLines(r: EncryptReport): string[] {
  const verb = r.applied ? "" : "would be ";
  return [
    r.applied ? "Applied." : "Dry run, nothing written. Run with --apply to write.",
    `Users with Google tokens: ${r.users}`,
    `  plain text, ${verb}encrypted: ${r.plainUsers}`,
    `Google Account rows holding tokens: ${r.accountsWithTokens}`,
    `  ${verb}cleared: ${r.accountsCleared}`,
    `  kept (only copy, the user has no refresh token in googleTokens): ${r.accountsKept}`,
  ];
}
