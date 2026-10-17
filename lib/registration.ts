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

export const DEFAULT_REGISTRATION_CLOSED_MESSAGE =
  "This instance is not accepting new accounts. Ask its owner to sign you up.";
const MAX_REGISTRATION_CLOSED_MESSAGE = 200;

/**
 * The line the login page shows a refused sign-in. REGISTRATION_CLOSED_MESSAGE
 * overrides it as plain text: whitespace collapsed, cut at 200 characters, and
 * rendered as a text node, so markup in it is shown, never parsed. Unset or
 * blank keeps the default.
 */
export function registrationClosedMessage(): string {
  const custom = process.env.REGISTRATION_CLOSED_MESSAGE?.replace(/\s+/g, " ").trim();
  if (!custom) return DEFAULT_REGISTRATION_CLOSED_MESSAGE;
  return Array.from(custom).slice(0, MAX_REGISTRATION_CLOSED_MESSAGE).join("").trim();
}
