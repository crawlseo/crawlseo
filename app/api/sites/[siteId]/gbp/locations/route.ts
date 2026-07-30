import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listGBPLocations } from "@/lib/google/gbp-client";

async function requireOwnedSite(siteId: string, userId: string) {
  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true },
  });
  return site && site.userId === userId ? site : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = await params;
    const site = await requireOwnedSite(siteId, session.user.id);
    if (!site) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const locations = await listGBPLocations(session.user.id);
    return Response.json({ locations });
  } catch (error) {
    console.error("GBP locations error:", error);
    return Response.json(
      { error: "Failed to list Business Profile locations" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = await params;
    const site = await requireOwnedSite(siteId, session.user.id);
    if (!site) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as {
      location?: unknown;
      label?: unknown;
    } | null;

    const location = typeof body?.location === "string" ? body.location : null;
    const label = typeof body?.label === "string" ? body.label : null;

    // Accept the resource name form "locations/12345", or clear the link with null.
    if (location !== null && !/^locations\/\d+$/.test(location)) {
      return Response.json({ error: "Invalid location" }, { status: 400 });
    }

    await db.site.update({
      where: { id: siteId },
      data: { gbpLocation: location, gbpLabel: location ? label : null },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("GBP location update error:", error);
    return Response.json(
      { error: "Failed to update Business Profile location" },
      { status: 500 }
    );
  }
}
