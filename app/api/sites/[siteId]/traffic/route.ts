import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDailyTraffic } from "@/lib/seo-metrics";

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

    const url = new URL(_req.url);
    const days = Math.min(
      Math.max(Number(url.searchParams.get("days") || 90), 7),
      180
    );

    const data = await getDailyTraffic(siteId, days);
    return Response.json(data);
  } catch (error) {
    console.error("Error fetching traffic:", error);
    return Response.json({ error: "Failed to load traffic" }, { status: 500 });
  }
}
