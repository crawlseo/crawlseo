import { auth } from "@/lib/auth";
import { BingKeyMissingError, listBingSites } from "@/lib/bing";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json(await listBingSites(session.user.id));
  } catch (error) {
    if (error instanceof BingKeyMissingError) {
      return Response.json(
        { error: error.message, code: "BING_KEY_MISSING" },
        { status: 400 }
      );
    }

    console.error("Error listing Bing sites:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to list Bing sites",
      },
      { status: 500 }
    );
  }
}
