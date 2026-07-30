import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const savedKeywords = await db.savedKeyword.findMany({
      where: { siteId },
      orderBy: { createdAt: "desc" },
    });

    // Fetch latest rank data for each saved keyword
    const withRankData = await Promise.all(
      savedKeywords.map(async (sk) => {
        const latestKeyword = await db.keyword.findFirst({
          where: { siteId, query: sk.query },
          orderBy: { date: "desc" },
          select: {
            clicks: true,
            impressions: true,
            ctr: true,
            position: true,
            page: true,
            date: true,
          },
        });

        return {
          id: sk.id,
          query: sk.query,
          notes: sk.notes,
          createdAt: sk.createdAt,
          latestRank: latestKeyword,
        };
      })
    );

    return Response.json(withRankData);
  } catch (error) {
    console.error("Saved keywords GET error:", error);
    return Response.json(
      { error: "Failed to load saved keywords" },
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
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      query?: string;
      notes?: string;
      tags?: unknown;
    };
    if (!body.query || typeof body.query !== "string") {
      return Response.json(
        { error: "Missing required field: query" },
        { status: 400 }
      );
    }

    // Normalize tags: strings only, trimmed, de-duplicated, capped.
    const tags = Array.isArray(body.tags)
      ? Array.from(
          new Set(
            body.tags
              .filter((t): t is string => typeof t === "string")
              .map((t) => t.trim())
              .filter((t) => t.length > 0 && t.length <= 40)
          )
        ).slice(0, 20)
      : undefined;

    const saved = await db.savedKeyword.upsert({
      where: {
        siteId_query: {
          siteId,
          query: body.query,
        },
      },
      create: {
        siteId,
        query: body.query,
        notes: body.notes ?? null,
        tags: tags ?? [],
      },
      update: {
        notes: body.notes ?? undefined,
        tags: tags ?? undefined,
      },
    });

    return Response.json(saved, { status: 201 });
  } catch (error) {
    console.error("Saved keywords POST error:", error);
    return Response.json(
      { error: "Failed to save keyword" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = await params;
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json()) as { query?: string };
    if (!body.query || typeof body.query !== "string") {
      return Response.json(
        { error: "Missing required field: query" },
        { status: 400 }
      );
    }

    await db.savedKeyword.delete({
      where: {
        siteId_query: {
          siteId,
          query: body.query,
        },
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Saved keywords DELETE error:", error);
    return Response.json(
      { error: "Failed to delete saved keyword" },
      { status: 500 }
    );
  }
}
