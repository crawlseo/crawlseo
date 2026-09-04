import { auth } from "@/lib/auth";
import { syncBingDataForSite } from "@/lib/workers/bing-sync";

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = (await req.json()) as { siteId?: string };
    if (!siteId) {
      return Response.json({ error: "Missing siteId" }, { status: 400 });
    }

    const result = await syncBingDataForSite(session.user.id, siteId);

    if (!result.success) {
      return Response.json(result, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    console.error("Bing sync error:", error);

    return Response.json(
      { error: error instanceof Error ? error.message : "Bing sync failed" },
      { status: 500 }
    );
  }
}
