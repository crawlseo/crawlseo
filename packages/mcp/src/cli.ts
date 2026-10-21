/**
 * crawlseo-mcp: the read-only crawlseo MCP server.
 *
 * Every tool reads through a crawlseo instance's /api/v1 API with an access
 * key; the server never connects to a database and nothing it does writes,
 * queues or triggers anything.
 *
 *   stdio (default):  CRAWLSEO_URL=http://localhost:3000 CRAWLSEO_API_KEY=<key> crawlseo-mcp
 *   HTTP:             CRAWLSEO_URL=http://localhost:3000 crawlseo-mcp --http [--port 3333] [--host 127.0.0.1]
 *                     Clients send their own key: Authorization: Bearer <key>
 */

import type { AddressInfo } from "net";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { version } from "../package.json";
import { createApiClient } from "./api-client";
import { startHttpServer } from "./http";
import { createMcpServer } from "./tools";

const USAGE = `crawlseo-mcp ${version}: read-only MCP server for crawlseo

Usage:
  crawlseo-mcp                 stdio, for an MCP client that starts the server
  crawlseo-mcp --http          streamable HTTP on /mcp, plus /health

Options (HTTP mode):
  --port <n>                   default 3333
  --host <address>             default 127.0.0.1

Environment:
  CRAWLSEO_URL                 your crawlseo instance (default http://localhost:3000)
  CRAWLSEO_API_KEY             an access key from Settings > MCP (stdio mode; in HTTP
                               mode each client sends its own key as a Bearer token)
`;

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.includes("--version")) {
    process.stdout.write(`${version}\n`);
    return;
  }

  const baseUrl = process.env.CRAWLSEO_URL?.trim() || "http://localhost:3000";

  if (args.includes("--http")) {
    const port = Number(option(args, "--port") ?? 3333);
    const host = option(args, "--host") ?? "127.0.0.1";
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid --port: ${option(args, "--port")}`);
    const server = await startHttpServer({ baseUrl, host, port, version });
    const { port: bound } = server.address() as AddressInfo;
    console.error(`CrawlSEO MCP server on http://${host}:${bound}/mcp, reading from ${baseUrl}`);
    const stop = () => server.close(() => process.exit(0));
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    return;
  }

  const apiKey = process.env.CRAWLSEO_API_KEY?.trim();
  if (!apiKey) {
    console.error("CRAWLSEO_API_KEY is not set. Create an access key in crawlseo under Settings > MCP.");
    process.exit(1);
  }
  const api = createApiClient({ baseUrl, apiKey, userAgent: `crawlseo-mcp/${version}` });
  await createMcpServer(api, version).connect(new StdioServerTransport());
  console.error(`CrawlSEO MCP server running on stdio, reading from ${baseUrl}`);
}

main().catch((err) => {
  console.error("Failed to start the crawlseo MCP server:", err instanceof Error ? err.message : err);
  process.exit(1);
});
