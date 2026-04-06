import { db } from "@/lib/db";

export async function GET() {
  try {
    // Test database connection
    await db.$queryRaw`SELECT 1`;

    return Response.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
