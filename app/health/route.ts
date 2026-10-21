import { db } from "@/lib/db";

// /health next to /mcp, for MCP clients and monitors: whether the app reaches
// its database. Unlike /api/health it never shows the database error.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
