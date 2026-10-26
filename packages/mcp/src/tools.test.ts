import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The MCP tools end to end against the real /api/v1 handler on PGlite: every
// tool reads through the API with the key, sees the key owner's data only,
// sends GET requests only and changes nothing.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { handleApiV1 } from "@/lib/api-v1/router";
import { seedApiFixtures, snapshotUserData, type Fixtures } from "@/lib/testing/api-fixtures";
import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { createApiClient } from "./api-client";
import { createMcpServer, TOOL_NAMES } from "./tools";

let t: TestDb;
let db: PrismaClient;
let f: Fixtures;
const methods: string[] = [];

beforeAll(async () => {
  t = await createTestDb();
  db = holder.db = t.db;
  f = await seedApiFixtures(db);
}, 120_000);

afterAll(async () => {
  await t?.close();
});

async function connect(apiKey: string) {
  const api = createApiClient({
    baseUrl: "http://crawlseo.test",
    apiKey,
    fetch: (req) => {
      methods.push(req.method);
      return handleApiV1(req);
    },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(api, "test").connect(serverSide);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  return { text: res.content.map((c) => c.text).join("\n"), isError: res.isError ?? false };
}

const CALLS: [string, Record<string, unknown>, RegExp][] = [
  ["list_sites", {}, /quilltab\.app\s+\(id: site-a\)[\s\S]*Bing: https:\/\/quilltab\.app\//],
  ["get_site_overview", { siteId: "site-a" }, /Site: quilltab\.app[\s\S]*Clicks:[\s\S]*Status: FAILED/],
  ["get_keywords", { siteId: "site-a" }, /quilltab notes/],
  ["get_keywords", { siteId: "site-a", startDate: "2020-01-01", endDate: "2020-01-31" }, /No keywords found for 2020-01-01 to 2020-01-31/],
  ["get_pages", { siteId: "site-a", days: 7 }, /Top 1 pages/],
  ["get_traffic", { siteId: "site-a", days: 14 }, /Daily traffic/],
  ["list_crawls", { siteId: "site-a" }, /crawl-a1[\s\S]*crawl-a2|crawl-a2[\s\S]*crawl-a1/],
  ["get_crawl_issues", { siteId: "site-a" }, /Crawl crawl-a1[\s\S]*2 issues: 1 critical, 1 warning, 0 info/],
  ["get_crawl_issues", { siteId: "site-a", crawlId: "crawl-a1", severity: "CRITICAL" }, /BROKEN_LINK/],
  ["get_vitals", { siteId: "site-a", device: "MOBILE" }, /MOBILE/],
  ["get_opportunities", { siteId: "site-a" }, /SEO Opportunities Summary/],
  ["get_bing_traffic", { siteId: "site-a", days: 12 }, /Total: 20 clicks, 200 impressions, 53 pages crawled[\s\S]*\| -/],
  ["get_bing_keywords", { siteId: "site-a" }, /quilltab bing\s+\| 6\s+\| 400\s+\| 5\.0\s+\| 2/],
  ["get_bing_pages", { siteId: "site-a" }, /https:\/\/quilltab\.app\/\s+\| 3/],
];

describe("MCP tools", () => {
  it("lists exactly the read-only tools, each marked read-only", async () => {
    const client = await connect(f.keyA);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool.name).not.toMatch(/run|start|sync|create|update|delete|set|add|remove/);
    }
    await client.close();
  });

  it("every tool answers from the API with GET only, and nothing changes", async () => {
    const client = await connect(f.keyA);
    const before = await snapshotUserData(db);
    methods.length = 0;
    const called = new Set<string>();
    for (const [name, args, expected] of CALLS) {
      const res = await call(client, name, args);
      expect(res.isError, `${name}: ${res.text}`).toBe(false);
      expect(res.text, name).toMatch(expected);
      expect(res.text, name).not.toContain("secret");
      called.add(name);
    }
    expect([...called].sort()).toEqual([...TOOL_NAMES].sort());
    expect(methods.length).toBeGreaterThanOrEqual(CALLS.length);
    expect(new Set(methods)).toEqual(new Set(["GET"]));
    expect(await snapshotUserData(db)).toBe(before);
    await client.close();
  });

  it("another user's site reads as not found through every site tool", async () => {
    const client = await connect(f.keyA);
    for (const name of TOOL_NAMES.filter((n) => n !== "list_sites")) {
      const res = await call(client, name, { siteId: "site-b" });
      expect(res.isError, name).toBe(true);
      expect(res.text, name).toBe("Site not found");
    }
    const other = await call(client, "get_crawl_issues", { siteId: "site-a", crawlId: "crawl-b1" });
    expect(other).toEqual({ isError: true, text: "Crawl not found" });
    await client.close();
  });

  it("a wrong key gets a tool error, not data", async () => {
    const client = await connect("crawlseo_wrong");
    const res = await call(client, "list_sites");
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/^Invalid API key/);
    await client.close();
  });

  it("the package never reaches the database or the app's code", () => {
    const dir = __dirname;
    for (const file of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
      const source = readFileSync(join(dir, file), "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec, `${file} imports ${spec}`).toMatch(/^(\.\/|\.\.\/package\.json$|@modelcontextprotocol\/sdk\/|zod$|crypto$|http$|net$)/);
      }
      expect(source, file).not.toMatch(/DATABASE_URL|PrismaClient/);
    }
  });
});
