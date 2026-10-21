import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mcpStatus, setMcpEnabled } from "@/lib/mcp-settings";

/*
 * Settings > MCP for the signed-in user: GET whether MCP is on and the access
 * keys, PUT { enabled } to turn it on or off. Off, every key is refused by
 * /mcp and /api/v1; the keys stay and work again once it is turned back on.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await mcpStatus(db, session.user.id));
}

export async function PUT(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return Response.json({ error: "enabled must be true or false" }, { status: 400 });
  await setMcpEnabled(db, userId, body.enabled);
  return Response.json(await mcpStatus(db, userId));
}
