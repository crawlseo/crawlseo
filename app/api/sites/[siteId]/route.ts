import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertPublicDomain } from "@/lib/crawler/engine";
import { siteDomainFromProperty } from "@/lib/site-domain";

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

    const { domain, gscProperty, bingSite } = (await req.json()) as {
      domain?: string;
      gscProperty?: string;
      bingSite?: string;
    };

    const normalizedDomain = domain ? siteDomainFromProperty(domain) : null;
    if (domain && !normalizedDomain) {
      return Response.json({ error: "Invalid domain" }, { status: 400 });
    }

    // Same SSRF guard as POST /api/sites: the crawler fetches
    // https://${site.domain}, so a changed domain must be public too.
    if (normalizedDomain) {
      try {
        await assertPublicDomain(normalizedDomain);
      } catch {
        return Response.json(
          { error: "Domain must resolve to a public IP address" },
          { status: 400 }
        );
      }
    }

    // Stored Bing rows are keyed by site, not by property, so pointing the site
    // at a different property would blend two properties' history - and page
    // URLs from both would normalise to the same key and count twice.
    if (bingSite !== undefined && typeof bingSite !== "string") {
      return Response.json({ error: "bingSite must be a string" }, { status: 400 });
    }
    const nextBingSite = bingSite === undefined ? undefined : bingSite || null;
    // The picker only offers properties the account owns, but the endpoint is
    // reachable directly: a value that is not a URL syncs nothing and looks
    // exactly like a site with no Bing data.
    if (nextBingSite) {
      let protocol = "";
      try {
        protocol = new URL(nextBingSite).protocol;
      } catch {}
      if (!/^https?:$/.test(protocol)) {
        return Response.json(
          { error: "bingSite must be an http(s) URL" },
          { status: 400 }
        );
      }
    }
    const change = {
      where: { id: siteId },
      data: {
        ...(normalizedDomain && { domain: normalizedDomain }),
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
    };
    const updated =
      nextBingSite === undefined
        ? await db.site.update(change)
        : // Decided and written under the row lock: bing-sync.ts holds this
          // row while it upserts, and another PUT may have moved the property
          // since the ownership read above. Whichever side commits first, the
          // other sees the rows it must wipe or must not write, and a failed
          // update (say a duplicate domain) rolls the wipe back with it.
          await db.$transaction(async (tx) => {
            const [current] = await tx.$queryRaw<{ bingSite: string | null }[]>`
              SELECT "bingSite" FROM "Site" WHERE "id" = ${siteId} FOR NO KEY UPDATE
            `;
            if (nextBingSite !== (current?.bingSite ?? null)) {
              await tx.bingSearchWeekly.deleteMany({ where: { siteId } });
              await tx.bingDaily.deleteMany({ where: { siteId } });
            }
            return tx.site.update(change);
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
