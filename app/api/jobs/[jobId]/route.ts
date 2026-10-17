import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { recoverStaleJobs } from "@/lib/jobs/queue";
import { jobView } from "@/lib/jobs/site-jobs";

/** The state of one job, for the client that queued it. Only the site's owner sees it. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { site: { select: { id: true, userId: true } } },
    });
    // Same answer for a job that does not exist and one of another user's sites.
    if (!job || job.site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // A job whose process died reads as queued again or failed, not running (#57).
    await recoverStaleJobs(db, { siteId: job.site.id });
    const found = await jobView(db, jobId);
    if (!found) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(found.view);
  } catch (error) {
    console.error("Job status error:", error);
    return Response.json({ error: "Failed to load the job" }, { status: 500 });
  }
}
