import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReauthRequiredError } from "@/lib/google";
import { syncGSCDataForSite } from "@/lib/workers/gsc-sync";

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = (await req.json()) as { siteId: string };

    // Verify site belongs to user
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, gscProperty: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json(
        { error: "Site not found or unauthorized" },
        { status: 404 }
      );
    }

    if (!site.gscProperty) {
      return Response.json(
        { error: "Site does not have GSC property connected" },
        { status: 400 }
      );
    }

    const result = await syncGSCDataForSite(session.user.id, siteId, 90);

    if (!result.success) {
      return Response.json({ error: result.error || "Sync failed" }, { status: 500 });
    }

    return Response.json({
      success: true,
      keywordsInserted: result.keywordsInserted,
      pagesInserted: result.pagesInserted,
    });
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      return Response.json(
        { error: error.message, code: "REAUTH_REQUIRED" },
        { status: 401 }
      );
    }

    console.error("Error syncing GSC data:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync GSC data",
      },
      { status: 500 }
    );
  }
}
