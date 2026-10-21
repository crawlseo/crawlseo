import type { PrismaClient } from "@prisma/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The instance's /mcp endpoint on a real Prisma client (PGlite): refused
// without a key, with a wrong or revoked key and while MCP is off (the
// default); with a key it serves the read-only tools for the key's user.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createAccessKey } from "@/lib/access-keys";
import { seedApiFixtures, snapshotUserData, type Fixtures } from "@/lib/testing/api-fixtures";
import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { TOOL_NAMES } from "@/packages/mcp/src/tools";
import { DELETE, GET, POST } from "./route";

let t: TestDb;
let db: PrismaClient;
let f: Fixtures;

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  f = await seedApiFixtures(db);
}, 120_000);

afterAll(async () => {
  await t?.close();
});

const URL_ = "http://localhost/mcp";
const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};

function post(key: string | null, body: unknown = INIT) {
  return POST(
    new Request(URL_, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(key && { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify(body),
    })
  );
}

/** An MCP client whose requests go straight to the route handlers. */
async function connect(key: string) {
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
    fetch: async (input, init) => {
      const req = new Request(input, init);
      return req.method === "POST" ? POST(req) : req.method === "DELETE" ? DELETE(req) : GET(req);
    },
  });
  const client = new Client({ name: "test", version: "1" });
  await client.connect(transport);
  return client;
}

describe("/mcp", () => {
  it("refuses a request without a key, with a wrong key, and with a revoked key", async () => {
    const missing = await post(null);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
    expect((await post(`${f.keyA}x`)).status).toBe(401);
    expect((await post("not-a-key")).status).toBe(401);

    const { id, key } = await createAccessKey(db, "user-a", "to revoke");
    expect((await post(key)).status).toBe(200);
    await db.accessKey.delete({ where: { id } });
    const revoked = await post(key);
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ error: { message: "Invalid API key" } });
  });

  it("is off by default: a valid key of a user who has not turned MCP on is refused", async () => {
    const res = await post(f.keyOff);
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain("Settings > MCP");
  });

  it("answers GET and DELETE with 405 (stateless), and only after the key check", async () => {
    expect((await GET(new Request(URL_))).status).toBe(401);
    const auth = { headers: { Authorization: `Bearer ${f.keyA}` } };
    expect((await GET(new Request(URL_, auth))).status).toBe(405);
    expect((await DELETE(new Request(URL_, { method: "DELETE", ...auth }))).status).toBe(405);
  });

  it("serves the read-only tools for the key's user, and nothing changes", async () => {
    const client = await connect(f.keyA);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...TOOL_NAMES].sort());
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

    const before = await snapshotUserData(db);
    const sites = (await client.callTool({ name: "list_sites", arguments: {} })) as { content: { text: string }[] };
    expect(sites.content[0].text).toContain("quilltab.app");
    expect(sites.content[0].text).not.toContain("secret-b.com");

    const other = (await client.callTool({ name: "get_keywords", arguments: { siteId: "site-b" } })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(other).toMatchObject({ isError: true, content: [{ text: "Site not found" }] });

    const issues = (await client.callTool({ name: "get_crawl_issues", arguments: { siteId: "site-a" } })) as { content: { text: string }[] };
    expect(issues.content[0].text).toContain("BROKEN_LINK");
    expect(await snapshotUserData(db)).toBe(before);
    await client.close();
  });

  it("refuses a run_crawl call: no such tool", async () => {
    const client = await connect(f.keyA);
    const res = (await client.callTool({ name: "run_crawl", arguments: { siteId: "site-a" } })) as { isError?: boolean };
    expect(res.isError).toBe(true);
    await client.close();
  });
});
