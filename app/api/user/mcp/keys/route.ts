import { createAccessKey, MAX_KEY_NAME, MAX_KEYS_PER_USER } from "@/lib/access-keys";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/*
 * POST { name }: creates an access key for the signed-in user. The answer is
 * the only time the key is shown; only its hash is stored.
 */

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_KEY_NAME) {
    return Response.json({ error: `Give the key a name of 1 to ${MAX_KEY_NAME} characters.` }, { status: 400 });
  }
  if ((await db.accessKey.count({ where: { userId } })) >= MAX_KEYS_PER_USER) {
    return Response.json({ error: `You have ${MAX_KEYS_PER_USER} keys. Revoke one first.` }, { status: 409 });
  }

  const created = await createAccessKey(db, userId, name);
  return Response.json(
    { ...created, createdAt: created.createdAt.toISOString(), lastUsedAt: null },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
