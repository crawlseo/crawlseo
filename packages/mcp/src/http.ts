/*
 * HTTP mode of the package: a small server with /mcp (streamable HTTP) and
 * /health, in front of a crawlseo instance. Each client sends its own access
 * key (Authorization: Bearer <key>), which is checked against the instance and
 * then used for every tool call of that request. The server holds no key.
 */

import { createHash } from "crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";

import { ApiRequestError, createApiClient } from "./api-client";
import { handleMcpRequest, refuseKey } from "./streamable";

const MAX_BODY_BYTES = 1_000_000;
const KEY_PREFIX = "crawlseo_";
/** How long a key the instance accepted is trusted without asking again. Tool calls always ask. */
const KEY_CACHE_MS = 60_000;

export type HttpOptions = { baseUrl: string; host: string; port: number; version: string };

function bearer(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : null;
}

/**
 * The request body, or null when it is larger than MAX_BODY_BYTES. The rest of
 * a body that is too large is read and dropped, so the client gets the 413
 * instead of a reset connection.
 */
async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk as Buffer);
  }
  return size > MAX_BODY_BYTES ? null : Buffer.concat(chunks);
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function startHttpServer(opts: HttpOptions): Promise<Server> {
  const accepted = new Map<string, number>();
  const userAgent = `crawlseo-mcp/${opts.version}`;

  /** null when the instance accepts the key, else the refusal to send. */
  async function checkKey(key: string): Promise<Response | null> {
    // Not a crawlseo key at all: no need to ask the instance.
    if (!key.startsWith(KEY_PREFIX)) return refuseKey(401, "Invalid API key", { "WWW-Authenticate": 'Bearer error="invalid_token"' });
    const id = createHash("sha256").update(key).digest("hex");
    if ((accepted.get(id) ?? 0) > Date.now()) return null;
    try {
      await createApiClient({ baseUrl: opts.baseUrl, apiKey: key, userAgent }).get("/key");
      if (accepted.size > 1000) accepted.clear();
      accepted.set(id, Date.now() + KEY_CACHE_MS);
      return null;
    } catch (err) {
      accepted.delete(id);
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403 || err.status === 429)) {
        return refuseKey(err.status, err.message);
      }
      // The details name the instance; they go to the log, not to a caller whose key was not accepted.
      console.error("[crawlseo-mcp] key check failed:", err instanceof Error ? err.message : err);
      return refuseKey(502, "crawlseo could not be reached");
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      return send(res, Response.json({ status: "ok", version: opts.version }));
    }
    if (url.pathname !== "/mcp") return send(res, Response.json({ error: "Not found" }, { status: 404 }));

    const key = bearer(req.headers.authorization);
    if (!key) return send(res, refuseKey(401, "Missing API key", { "WWW-Authenticate": "Bearer" }));
    const refusal = await checkKey(key);
    if (refusal) return send(res, refusal);

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(", "));
    }
    const body = req.method === "POST" ? await readBody(req) : undefined;
    if (body === null) return send(res, refuseKey(413, "Request body too large"));
    // A fixed base: the client's Host header plays no part in handling the request.
    const webReq = new Request(new URL(url.pathname + url.search, "http://localhost"), {
      method: req.method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
    const api = createApiClient({ baseUrl: opts.baseUrl, apiKey: key, userAgent });
    return send(res, await handleMcpRequest(webReq, api, opts.version));
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error("[crawlseo-mcp]", err);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal error" }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve(server));
  });
}
