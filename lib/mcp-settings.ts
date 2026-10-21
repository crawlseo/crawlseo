import type { PrismaClient } from "@prisma/client";
import { listAccessKeys } from "@/lib/access-keys";

/*
 * Settings > MCP: whether the user's access keys work (off by default) and
 * the keys themselves, never the key or its hash.
 */

type Db = Pick<PrismaClient, "userSettings" | "accessKey">;

export type McpKeyView = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };
export type McpStatus = { enabled: boolean; keys: McpKeyView[] };

export async function mcpStatus(db: Db, userId: string): Promise<McpStatus> {
  const [settings, keys] = await Promise.all([
    db.userSettings.findUnique({ where: { userId }, select: { mcpEnabled: true } }),
    listAccessKeys(db, userId),
  ]);
  return {
    enabled: settings?.mcpEnabled ?? false,
    keys: keys.map((k) => ({
      ...k,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    })),
  };
}

export async function setMcpEnabled(db: Db, userId: string, enabled: boolean): Promise<void> {
  await db.userSettings.upsert({ where: { userId }, create: { userId, mcpEnabled: enabled }, update: { mcpEnabled: enabled } });
}
