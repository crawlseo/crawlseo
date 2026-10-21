import { describe, expect, it, vi } from "vitest";
import { bearerKey, createAccessKey, findKeyOwner, hashKey, KEY_PREFIX, touchKey } from "./access-keys";

// Keys are stored hashed and shown once; lastUsedAt is written at most once a minute.

function fakeDb() {
  const rows: { id: string; userId: string; name: string; keyHash: string; prefix: string; createdAt: Date; lastUsedAt: Date | null }[] = [];
  const accessKey = {
    create: vi.fn(async ({ data }: { data: { userId: string; name: string; keyHash: string; prefix: string } }) => {
      const row = { id: `k${rows.length + 1}`, createdAt: new Date(), lastUsedAt: null, ...data };
      rows.push(row);
      return row;
    }),
    findUnique: vi.fn(async ({ where }: { where: { keyHash: string } }) => {
      const row = rows.find((r) => r.keyHash === where.keyHash);
      return row ? { ...row, user: { settings: null } } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: { lastUsedAt: Date } }) => {
      const row = rows.find((r) => r.id === where.id);
      if (row) row.lastUsedAt = data.lastUsedAt;
      return { count: row ? 1 : 0 };
    }),
  };
  return { rows, db: { accessKey } as never, accessKey };
}

describe("access keys", () => {
  it("stores only the hash and a short prefix", async () => {
    const { rows, db } = fakeDb();
    const created = await createAccessKey(db, "u1", "laptop");
    expect(created.key.startsWith(KEY_PREFIX)).toBe(true);
    expect(created.key.length).toBeGreaterThan(KEY_PREFIX.length + 40);
    expect(rows[0].keyHash).toBe(hashKey(created.key));
    expect(JSON.stringify(rows)).not.toContain(created.key);
    expect(created.key.startsWith(rows[0].prefix)).toBe(true);
    expect(rows[0].prefix.length).toBeLessThan(20);
  });

  it("finds the key's owner for the key and nothing else", async () => {
    const { db } = fakeDb();
    const { key, id } = await createAccessKey(db, "u1", "laptop");
    expect(await findKeyOwner(db, key)).toEqual({ keyId: id, userId: "u1", mcpEnabled: false, lastUsedAt: null });
    expect(await findKeyOwner(db, key.slice(0, -1))).toBeNull();
    expect(await findKeyOwner(db, hashKey(key))).toBeNull();
  });

  it("writes lastUsedAt at most once a minute", async () => {
    const { db, accessKey } = fakeDb();
    const { key } = await createAccessKey(db, "u1", "laptop");
    const t0 = new Date("2026-10-21T10:00:00Z");
    const use = async (now: Date) => touchKey(db, (await findKeyOwner(db, key))!, now);
    await use(t0);
    await use(new Date(t0.getTime() + 30_000));
    expect(accessKey.updateMany).toHaveBeenCalledTimes(1);
    await use(new Date(t0.getTime() + 61_000));
    expect(accessKey.updateMany).toHaveBeenCalledTimes(2);
  });

  it("reads the key from a Bearer header only", () => {
    expect(bearerKey("Bearer crawlseo_abc")).toBe("crawlseo_abc");
    expect(bearerKey("bearer  crawlseo_abc ")).toBe("crawlseo_abc");
    expect(bearerKey("Basic crawlseo_abc")).toBeNull();
    expect(bearerKey("Bearer")).toBeNull();
    expect(bearerKey("Bearer a b")).toBeNull();
    expect(bearerKey(null)).toBeNull();
  });
});
