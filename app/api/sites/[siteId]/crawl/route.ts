import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { runSiteCrawl } from "@/lib/crawler/engine";

export const maxDuration = 60;

export async function POST(
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
      select: { userId: true, domain: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // Prevent concurrent crawls
    const running = await db.crawl.findFirst({
      where: { siteId, status: "RUNNING" },
    });
    if (running) {
      return Response.json(
        { error: "A crawl is already running", crawlId: running.id },
        { status: 409 }
      );
    }

    const result = await runSiteCrawl(siteId, site.domain);
    return Response.json(result);
  } catch (error) {
    console.error("Crawl error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Crawl failed" },
      { status: 500 }
    );
  }
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
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const crawls = await db.crawl.findMany({
      where: { siteId },
      orderBy: { startedAt: "desc" },
      take: 10,
      include: {
        issues: {
          take: 200,
          orderBy: { severity: "asc" },
        },
      },
    });

    return Response.json(crawls);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed to load crawls" }, { status: 500 });
  }
}
