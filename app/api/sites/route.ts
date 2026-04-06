import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sites = await db.site.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            keywords: true,
            crawls: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(sites);
  } catch (error) {
    console.error("Error fetching sites:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch sites",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domain, gscProperty } = (await req.json()) as {
      domain: string;
      gscProperty: string;
    };

    if (!domain || !gscProperty) {
      return Response.json(
        { error: "Missing domain or gscProperty" },
        { status: 400 }
      );
    }

    // Check if site already exists
    const existing = await db.site.findUnique({
      where: {
        userId_domain: {
          userId: session.user.id,
          domain,
        },
      },
    });

    if (existing) {
      return Response.json(
        { error: "Site already exists" },
        { status: 409 }
      );
    }

    // Create the site
    const site = await db.site.create({
      data: {
        userId: session.user.id,
        domain,
        gscProperty,
      },
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        createdAt: true,
      },
    });

    // Trigger initial GSC sync in the background (without waiting)
    fetch("http://localhost:3000/api/gsc/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id }),
    }).catch(console.error);

    return Response.json(site, { status: 201 });
  } catch (error) {
    console.error("Error creating site:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to create site",
      },
      { status: 500 }
    );
  }
}
