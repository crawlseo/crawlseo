import { db } from "./db";

/**
 * DISABLE_REGISTRATION=true closes sign-up on a self-hosted instance: a Google
 * account that has never signed in here is refused, while existing users keep
 * signing in, including the re-consent the GSC reconnect banner triggers.
 * "Existing" means a linked Account row, which is what the Prisma adapter
 * itself uses to recognise a returning user.
 */
export async function isSignInAllowed(
  account: { provider: string; providerAccountId: string } | null | undefined
): Promise<boolean> {
  if (process.env.DISABLE_REGISTRATION?.trim().toLowerCase() !== "true") return true;
  if (!account) return false;

  const known = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      },
    },
    select: { id: true },
  });
  return known !== null;
}
