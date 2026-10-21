import { execFileSync, spawn, type ChildProcess } from "child_process";
import { once } from "events";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Smoke test of the built package (dist/cli.js, what npm pack ships) as a
// child process, against a local HTTP server that answers /api/v1 with the
// app's handler on PGlite: stdio mode with CRAWLSEO_URL and CRAWLSEO_API_KEY,
// and HTTP mode with /mcp and /health.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { handleApiV1 } from "@/lib/api-v1/router";
import { seedApiFixtures, type Fixtures } from "@/lib/testing/api-fixtures";
import { createTestDb, type TestDb } from "@/lib/testing/pglite";

const PKG = join(__dirname, "..");
const CLI = join(PKG, "dist/cli.js");

let t: TestDb;
let f: Fixtures;
let api: Server;
let apiUrl: string;
const children: ChildProcess[] = [];

beforeAll(async () => {
  execFileSync(process.execPath, [join(PKG, "build.mjs")], { stdio: "inherit" });
  t = await createTestDb();
  holder.db = t.db;
  f = await seedApiFixtures(t.db);
  api = createServer(async (req, res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const response = await handleApiV1(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers }));
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(await response.text());
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
  for (const child of children) child.kill();
  await new Promise((resolve) => api?.close(resolve));
  await t?.close();
});

function env(extra: Record<string, string>): NodeJS.ProcessEnv & Record<string, string> {
  return { PATH: process.env.PATH ?? "", ...extra } as unknown as NodeJS.ProcessEnv & Record<string, string>;
}

describe("@crawlseo/mcp (built)", () => {
  it("--version prints the package version", async () => {
    const pkg = (await import("../package.json")).default;
    expect(execFileSync(process.execPath, [CLI, "--version"], { encoding: "utf8" }).trim()).toBe(pkg.version);
  });

  it("stdio: exits with a message when CRAWLSEO_API_KEY is missing", () => {
    let stderr = "";
    try {
      execFileSync(process.execPath, [CLI], { env: env({ CRAWLSEO_URL: apiUrl }), stdio: "pipe", input: "" });
    } catch (err) {
      stderr = String((err as { stderr: Buffer }).stderr);
    }
    expect(stderr).toContain("CRAWLSEO_API_KEY is not set");
  });

  it("stdio: lists the tools and reads the key owner's sites through the API", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI],
      env: env({ CRAWLSEO_URL: apiUrl, CRAWLSEO_API_KEY: f.keyA }),
      stderr: "pipe",
    });
    const client = new Client({ name: "smoke", version: "1" });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("get_crawl_issues");
    expect(tools.map((tool) => tool.name)).not.toContain("run_crawl");
    const res = (await client.callTool({ name: "list_sites", arguments: {} })) as { content: { text: string }[] };
    expect(res.content[0].text).toContain("quilltab.app");
    expect(res.content[0].text).not.toContain("secret-b.com");
    await client.close();
  }, 30_000);

  it("HTTP: /health, and /mcp only with a key the instance accepts", async () => {
    const child = spawn(process.execPath, [CLI, "--http", "--port", "0"], { env: env({ CRAWLSEO_URL: apiUrl }) });
    children.push(child);
    let log = "";
    const mcpUrl = await new Promise<string>((resolve, reject) => {
      child.stderr!.on("data", (chunk: Buffer) => {
        log += chunk.toString();
        const m = log.match(/(http:\/\/127\.0\.0\.1:\d+\/mcp)/);
        if (m) resolve(m[1]);
      });
      child.once("exit", () => reject(new Error(`exited: ${log}`)));
    });

    const health = await fetch(mcpUrl.replace("/mcp", "/health"));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });

    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } };
    const post = (key?: string) =>
      fetch(mcpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(key && { Authorization: `Bearer ${key}` }) },
        body: JSON.stringify(init),
      });
    expect((await post()).status).toBe(401);
    expect((await post("crawlseo_wrong")).status).toBe(401);
    expect((await post(f.keyOff)).status).toBe(403);

    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { Authorization: `Bearer ${f.keyA}` } },
    });
    const client = new Client({ name: "smoke", version: "1" });
    await client.connect(transport);
    const res = (await client.callTool({ name: "get_vitals", arguments: { siteId: "site-a" } })) as { content: { text: string }[] };
    expect(res.content[0].text).toContain("vitals reports");
    await client.close();
  }, 30_000);
});
