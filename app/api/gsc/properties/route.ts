import { auth } from "@/lib/auth";
import { listGSCProperties } from "@/lib/google";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const properties = await listGSCProperties(session.user.id);

    return Response.json(properties);
  } catch (error) {
    console.error("Error listing GSC properties:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to list properties",
      },
      { status: 500 }
    );
  }
}
