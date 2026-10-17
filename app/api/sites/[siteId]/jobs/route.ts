import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recoverStaleJobs } from "@/lib/jobs/queue";

/**
 * The site's jobs: those queued or running, and the latest finished one of
 * each type.
 */
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
    const site = await db.site.findUnique({ where: { id: siteId }, select: { userId: true } });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await recoverStaleJobs(db, { siteId });
    const select = {
      id: true,
      type: true,
      status: true,
      source: true,
      attempts: true,
      maxAttempts: true,
      runAt: true,
      startedAt: true,
      finishedAt: true,
      lastError: true,
      errorCode: true,
      crawlId: true,
    } as const;

    const [active, finished] = await Promise.all([
      db.job.findMany({
        where: { siteId, status: { in: ["QUEUED", "RUNNING"] } },
        orderBy: { createdAt: "asc" },
        select,
      }),
      db.job.findMany({
        where: { siteId, status: { in: ["SUCCEEDED", "FAILED"] } },
        orderBy: { finishedAt: "desc" },
        distinct: ["type"],
        select,
      }),
    ]);

    return Response.json({ active, latest: finished });
  } catch (error) {
    console.error("Site jobs error:", error);
    return Response.json({ error: "Failed to load jobs" }, { status: 500 });
  }
}
