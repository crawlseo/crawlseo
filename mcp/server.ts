#!/usr/bin/env node

/**
 * CrawlSEO MCP server over stdio, for Claude Code and other MCP clients.
 *
 * Read-only: every tool reads through the instance's /api/v1 API with an
 * access key, and the server never connects to the database.
 *
 * Run: CRAWLSEO_URL=http://localhost:3000 CRAWLSEO_API_KEY=<key> npx tsx mcp/server.ts
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { version } from "../package.json";
import { createApiClient } from "./api-client";
import { createMcpServer } from "./tools";

async function main() {
  const baseUrl = process.env.CRAWLSEO_URL?.trim() || "http://localhost:3000";
  const apiKey = process.env.CRAWLSEO_API_KEY?.trim();
  if (!apiKey) {
    console.error("CRAWLSEO_API_KEY is not set. Create an access key in crawlseo and pass it in CRAWLSEO_API_KEY.");
    process.exit(1);
  }

  const api = createApiClient({ baseUrl, apiKey, userAgent: `crawlseo-mcp/${version}` });
  await createMcpServer(api, version).connect(new StdioServerTransport());
  console.error(`CrawlSEO MCP server running on stdio, reading from ${baseUrl}`);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
