import { createHash, randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";

/*
 * Access keys for the read-only API (/api/v1) and the MCP server. A key is
 * "crawlseo_" plus 32 random bytes; only its SHA-256 hash is stored, so a key
 * is shown once, when it is created, and cannot be read back. High-entropy
 * keys need no slow hash: nobody can guess one, and the hash is what the
 * lookup uses.
 */

export const KEY_PREFIX = "crawlseo_";
/** How much of the key Settings shows to tell keys apart. */
const SHOWN_CHARS = KEY_PREFIX.length + 6;
/** lastUsedAt is written at most this often per key. */
const LAST_USED_EVERY_MS = 60_000;
export const MAX_KEY_NAME = 60;

type Db = Pick<PrismaClient, "accessKey">;

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type CreatedKey = { id: string; name: string; prefix: string; createdAt: Date; key: string };

/** Creates a key for the user and returns it with the key itself, the only time it is available. */
export async function createAccessKey(db: Db, userId: string, name: string): Promise<CreatedKey> {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url");
  const row = await db.accessKey.create({
    data: { userId, name, keyHash: hashKey(key), prefix: key.slice(0, SHOWN_CHARS) },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });
  return { ...row, key };
}

/** The key from an `Authorization: Bearer <key>` header, or null. */
export function bearerKey(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : null;
}

export type KeyOwner = { keyId: string; userId: string };

/**
 * Who the key belongs to, or null for a key that does not exist (never did,
 * or was revoked). Records when it was used, at most once a minute.
 */
export async function authenticateKey(db: Db, key: string, now = new Date()): Promise<KeyOwner | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const row = await db.accessKey.findUnique({
    where: { keyHash: hashKey(key) },
    select: { id: true, userId: true, lastUsedAt: true },
  });
  if (!row) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_EVERY_MS) {
    // updateMany: a key revoked in the meantime is not an error.
    await db.accessKey.updateMany({ where: { id: row.id }, data: { lastUsedAt: now } });
  }
  return { keyId: row.id, userId: row.userId };
}
