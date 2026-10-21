import { revokeAccessKey } from "@/lib/access-keys";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/** DELETE: revokes one of the signed-in user's access keys. It stops working at once. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ keyId: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { keyId } = await params;
  if (!(await revokeAccessKey(db, userId, keyId))) return Response.json({ error: "Key not found" }, { status: 404 });
  return Response.json({ revoked: true });
}
