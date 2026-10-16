#!/usr/bin/env tsx
/**
 * Encrypt Google OAuth tokens stored in plain text.
 *
 * Rows written before tokens were encrypted keep working and are encrypted at
 * their next token refresh; this does it for every row at once. It also
 * clears the plain-text token copies on Google Account rows when the user's
 * googleTokens holds a refresh token. Safe to run again: encrypted rows are
 * left alone. Prints counts only, never a token.
 *
 * Needs DATABASE_URL and the same NEXTAUTH_SECRET (or AUTH_SECRET) as the app.
 *
 * Usage:
 *   npx tsx scripts/encrypt-google-tokens.ts          # dry run: print counts only
 *   npx tsx scripts/encrypt-google-tokens.ts --apply  # encrypt and clear
 */

import { PrismaClient } from "@prisma/client";
import { encryptStoredGoogleTokens, reportLines } from "../lib/google/encrypt-stored-tokens";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = new PrismaClient();
  try {
    const report = await encryptStoredGoogleTokens(db, { apply });
    for (const line of reportLines(report)) console.log(line);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
