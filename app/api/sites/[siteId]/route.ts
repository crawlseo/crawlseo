import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const site = await db.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        _count: {
          select: {
            keywords: true,
            pages: true,
            crawls: true,
            vitals: true,
          },
        },
      },
    });

    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }

    // Verify ownership
    if (site.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Remove userId from response
    const { userId, ...siteData } = site;

    return Response.json(siteData);
  } catch (error) {
    console.error("Error fetching site:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch site",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { domain, gscProperty } = (await req.json()) as {
      domain?: string;
      gscProperty?: string;
    };

    const updated = await db.site.update({
      where: { id: siteId },
      data: {
        ...(domain && { domain }),
        ...(gscProperty && { gscProperty }),
      },
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        updatedAt: true,
      },
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Error updating site:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to update site",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete site and cascade deletes keywords, pages, crawls, vitals, alerts
    await db.site.delete({
      where: { id: siteId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting site:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete site",
      },
      { status: 500 }
    );
  }
}
