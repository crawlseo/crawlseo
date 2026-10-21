/*
 * The MCP server's only way to data: GET requests to a crawlseo instance's
 * read-only API (/api/v1) with an access key. It never connects to a database.
 */

export type Query = Record<string, string | number | undefined>;

export interface ApiClient {
  get<T>(path: string, query?: Query): Promise<T>;
}

/** A request the instance refused or could not answer. The message is safe to show to the agent. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export type ApiClientOptions = {
  /** The instance, e.g. http://localhost:3000. */
  baseUrl: string;
  apiKey: string;
  /** For the instance's own /mcp endpoint, which answers in-process. */
  fetch?: (req: Request) => Promise<Response>;
  userAgent?: string;
  timeoutMs?: number;
};

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const send = opts.fetch ?? ((req: Request) => fetch(req));
  return {
    async get<T>(path: string, query: Query = {}): Promise<T> {
      const url = new URL(`${base}/api/v1${path}`);
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

      let res: Response;
      try {
        res = await send(
          new Request(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${opts.apiKey}`,
              Accept: "application/json",
              ...(opts.userAgent && { "User-Agent": opts.userAgent }),
            },
            signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
          })
        );
      } catch (err) {
        throw new ApiRequestError(0, `Could not reach crawlseo at ${base}: ${err instanceof Error ? err.message : String(err)}`);
      }

      const body = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
      if (!res.ok) {
        const reason = typeof body?.error === "string" ? body.error : `HTTP ${res.status}`;
        throw new ApiRequestError(res.status, explain(res.status, reason));
      }
      if (body === null) throw new ApiRequestError(res.status, `crawlseo at ${base} did not answer with JSON`);
      return body;
    },
  };
}

function explain(status: number, reason: string): string {
  if (status === 401) return `${reason}. Check the API key, or create a new one in crawlseo.`;
  if (status === 404 && reason === "Not found") return `${reason}. Is this a crawlseo instance with the /api/v1 API?`;
  return reason;
}
