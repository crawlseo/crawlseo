import { checkKey } from "@/lib/api-v1/auth";
import { countKeyRequest, handleApiV1, RATE_LIMITED_MESSAGE } from "@/lib/api-v1/router";
import { createApiClient } from "@/packages/mcp/src/api-client";
import { handleMcpRequest, refuseKey } from "@/packages/mcp/src/streamable";
import { APP_VERSION } from "@/lib/version";

/*
 * The instance's MCP endpoint (streamable HTTP, stateless). A request needs an
 * access key from Settings > MCP of a user who has MCP turned on there (off by
 * default); without one it is refused before any MCP message is read. The
 * tools are the @crawlseo/mcp package's: they read through /api/v1 with the
 * same key, answered in this process, so the key's user sees only their own
 * sites and nothing can write. Each request to /mcp counts once against the
 * key's rate limit, a tool call included.
 */

export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  const check = await checkKey(req);
  if (!check.ok) return refuseKey(check.status, check.error, check.headers);
  const rate = countKeyRequest(check.owner.keyId);
  if (!rate.ok) return refuseKey(429, RATE_LIMITED_MESSAGE, rate.headers);
  const api = createApiClient({
    baseUrl: new URL(req.url).origin,
    apiKey: check.key,
    fetch: (apiReq) => handleApiV1(apiReq, { countRequest: false }),
  });
  return handleMcpRequest(req, api, APP_VERSION);
}

export { handle as GET, handle as POST, handle as DELETE };
