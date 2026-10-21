import { bearerKey, findKeyOwner, touchKey, type KeyOwner } from "@/lib/access-keys";
import { db } from "@/lib/db";

/*
 * The gate in front of /api/v1 and /mcp: an access key that exists, of a user
 * who has MCP turned on in Settings > MCP (off by default).
 */

export const MCP_OFF_MESSAGE = "MCP is turned off for this account. Turn it on in Settings > MCP.";

export type KeyCheck = { ok: true; owner: KeyOwner; key: string } | { ok: false; status: 401 | 403; error: string; headers: Record<string, string> };

export async function checkKey(req: Request): Promise<KeyCheck> {
  const key = bearerKey(req.headers.get("authorization"));
  if (!key) return { ok: false, status: 401, error: "Missing API key", headers: { "WWW-Authenticate": "Bearer" } };
  const owner = await findKeyOwner(db, key);
  if (!owner) {
    return { ok: false, status: 401, error: "Invalid API key", headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } };
  }
  if (!owner.mcpEnabled) return { ok: false, status: 403, error: MCP_OFF_MESSAGE, headers: {} };
  await touchKey(db, owner);
  return { ok: true, owner, key };
}
