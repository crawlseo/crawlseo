import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Settings > MCP on a real Prisma client (PGlite): turning MCP on and off,
// creating a key (shown once, stored hashed) and revoking it, each for the
// signed-in user only.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const session = vi.hoisted(() => ({ userId: "user-a" as string | null }));
vi.mock("@/lib/auth", () => ({ auth: async () => (session.userId ? { user: { id: session.userId } } : null) }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { hashKey, MAX_KEYS_PER_USER } from "@/lib/access-keys";
import { handleApiV1 } from "@/lib/api-v1/router";
import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { DELETE } from "./keys/[keyId]/route";
import { POST } from "./keys/route";
import { GET, PUT } from "./route";

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.createMany({ data: [{ id: "user-a", email: "a@quilltab.app" }, { id: "user-b", email: "b@quilltab.app" }] });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  session.userId = "user-a";
  await db.accessKey.deleteMany();
  await db.userSettings.deleteMany();
});

const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
const create = (name: unknown) => POST(new Request("http://localhost/api/user/mcp/keys", json({ name })));
const revoke = (keyId: string) => DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ keyId }) });
const toggle = (enabled: unknown) => PUT(new Request("http://localhost/api/user/mcp", { method: "PUT", body: JSON.stringify({ enabled }) }));
const apiSites = (key: string) => handleApiV1(new Request("http://localhost/api/v1/sites", { headers: { Authorization: `Bearer ${key}` } }));

describe("Settings > MCP", () => {
  it("is off by default and turns on and off", async () => {
    expect(await (await GET()).json()).toEqual({ enabled: false, keys: [] });
    expect(await (await toggle(true)).json()).toMatchObject({ enabled: true });
    expect(await (await toggle(false)).json()).toMatchObject({ enabled: false });
    expect((await toggle("yes")).status).toBe(400);
  });

  it("shows a new key once and stores only its hash", async () => {
    const res = await create("  Laptop  ");
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; key: string; name: string; prefix: string };
    expect(created.name).toBe("Laptop");
    expect(created.key).toMatch(/^crawlseo_/);

    const row = await db.accessKey.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.keyHash).toBe(hashKey(created.key));
    expect(JSON.stringify(row)).not.toContain(created.key);

    const status = JSON.stringify(await (await GET()).json());
    expect(status).toContain(created.prefix);
    expect(status).not.toContain(created.key);
    expect(status).not.toContain(row.keyHash);
  });

  it("the key works only while MCP is on, and stops at once when revoked", async () => {
    const { id, key } = (await (await create("Laptop")).json()) as { id: string; key: string };
    expect((await apiSites(key)).status).toBe(403);
    await toggle(true);
    expect((await apiSites(key)).status).toBe(200);
    const [listed] = ((await (await GET()).json()) as { keys: { lastUsedAt: string | null }[] }).keys;
    expect(listed.lastUsedAt).not.toBeNull();

    expect((await revoke(id)).status).toBe(200);
    expect((await apiSites(key)).status).toBe(401);
    expect((await revoke(id)).status).toBe(404);
  });

  it("cannot revoke or see another user's key", async () => {
    session.userId = "user-b";
    const { id } = (await (await create("B's key")).json()) as { id: string };
    session.userId = "user-a";
    expect(((await (await GET()).json()) as { keys: unknown[] }).keys).toEqual([]);
    expect((await revoke(id)).status).toBe(404);
    expect(await db.accessKey.count({ where: { id } })).toBe(1);
  });

  it("refuses a missing or too long name, and more than the most keys", async () => {
    for (const name of ["", "   ", 42, "x".repeat(61)]) expect((await create(name)).status, String(name)).toBe(400);
    for (let i = 0; i < MAX_KEYS_PER_USER; i++) expect((await create(`k${i}`)).status).toBe(201);
    expect((await create("one more")).status).toBe(409);
  });

  it("needs a session", async () => {
    session.userId = null;
    expect((await GET()).status).toBe(401);
    expect((await toggle(true)).status).toBe(401);
    expect((await create("x")).status).toBe(401);
    expect((await revoke("x")).status).toBe(401);
  });
});
