import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { exportKeywordsCsv, exportPagesCsv } from "@/lib/seo-opportunities";

export async function GET(
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
      select: { userId: true, domain: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const type = new URL(req.url).searchParams.get("type") || "keywords";
    const csv =
      type === "pages"
        ? await exportPagesCsv(siteId)
        : await exportKeywordsCsv(siteId);

    const filename = `${site.domain}-${type}-28d.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}
