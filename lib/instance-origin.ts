import { headers } from "next/headers";

/**
 * This instance's address, for the /mcp URL Settings and the MCP page show:
 * NEXTAUTH_URL (or AUTH_URL) when set, else the host the browser reached.
 */
export async function instanceOrigin(): Promise<string> {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.AUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {}
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
