import type { PrismaClient } from "@prisma/client";

/** The Google ID token claims this app reads. Both are absent when Google leaves them out. */
export type GoogleProfile = { name?: unknown; picture?: unknown } | null | undefined;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * After a Google sign-in: copies the name and picture from the ID token to the
 * User row. The Prisma adapter writes them only when it creates the user, so a
 * row created without them (or with an old name) never gets them otherwise. A
 * claim Google leaves out keeps the stored value.
 */
export async function syncGoogleProfile(
  db: Pick<PrismaClient, "user">,
  email: string,
  profile: GoogleProfile
): Promise<void> {
  const name = text(profile?.name);
  const image = text(profile?.picture);
  if (!name && !image) return;

  const user = await db.user.findUnique({ where: { email }, select: { name: true, image: true } });
  if (!user) return;

  const data: { name?: string; image?: string } = {};
  if (name && name !== user.name) data.name = name;
  if (image && image !== user.image) data.image = image;
  if (Object.keys(data).length === 0) return;

  await db.user.update({ where: { email }, data });
}
