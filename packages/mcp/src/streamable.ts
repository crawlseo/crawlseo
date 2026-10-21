/*
 * One MCP request over streamable HTTP, stateless: a fresh server and
 * transport per POST, answered as JSON. Used by the package's HTTP mode and by
 * a crawlseo instance's own /mcp endpoint.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { ApiClient } from "./api-client";
import { createMcpServer } from "./tools";

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });
}

/** 401 or 403 for a request whose key was refused, in the JSON-RPC shape MCP clients read. */
export function refuseKey(status: number, message: string, headers: Record<string, string> = {}): Response {
  return jsonRpcError(status, message, headers);
}

/** Answers one request to an MCP endpoint whose key was already checked. */
export async function handleMcpRequest(req: Request, api: ApiClient, version: string): Promise<Response> {
  // Stateless: no SSE stream to open (GET) and no session to end (DELETE).
  if (req.method !== "POST") return jsonRpcError(405, "Method not allowed: use POST", { Allow: "POST" });

  const server = createMcpServer(api, version);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}
