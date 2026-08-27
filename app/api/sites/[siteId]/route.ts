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
      select: { userId: true, bingSite: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { domain, gscProperty, bingSite } = (await req.json()) as {
      domain?: string;
      gscProperty?: string;
      bingSite?: string;
    };

    // Stored Bing rows are keyed by site, not by property, so pointing the site
    // at a different property would blend two properties' history - and page
    // URLs from both would normalise to the same key and count twice.
    const nextBingSite = bingSite === undefined ? undefined : bingSite || null;
    // The picker only offers properties the account owns, but the endpoint is
    // reachable directly: a value that is not a URL syncs nothing and looks
    // exactly like a site with no Bing data.
    if (nextBingSite !== null && nextBingSite !== undefined) {
      const parsed = URL.parse?.(nextBingSite) ?? null;
      if (!parsed || !/^https?:$/.test(parsed.protocol)) {
        return Response.json(
          { error: "bingSite must be an http(s) URL" },
          { status: 400 }
        );
      }
    }
    if (nextBingSite !== undefined && nextBingSite !== site.bingSite) {
      await db.$transaction([
        db.bingSearchWeekly.deleteMany({ where: { siteId } }),
        db.bingDaily.deleteMany({ where: { siteId } }),
      ]);
    }

    const updated = await db.site.update({
      where: { id: siteId },
      data: {
        ...(domain && { domain }),
        ...(gscProperty && { gscProperty }),
        // An empty string clears the connection; undefined leaves it alone.
        ...(nextBingSite !== undefined && { bingSite: nextBingSite }),
      },
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        bingSite: true,
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
