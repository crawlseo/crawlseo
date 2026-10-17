import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { GSC_SYNC_JOB } from "@/lib/jobs/handlers";
import { requestSiteJob } from "@/lib/jobs/site-jobs";

/**
 * Queues a GSC sync for the site and answers 202 with the job id. The client
 * polls GET /api/jobs/[jobId]; the job's result has the fields this route
 * used to return (keywordsInserted, pagesInserted, startDate, endDate), and an
 * expired Google token fails it with errorCode REAUTH_REQUIRED.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = (await req.json()) as { siteId: string };

    // Verify site belongs to user
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, gscProperty: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json(
        { error: "Site not found or unauthorized" },
        { status: 404 }
      );
    }

    if (!site.gscProperty) {
      return Response.json(
        { error: "Site does not have GSC property connected" },
        { status: 400 }
      );
    }

    const { job, created } = await requestSiteJob(db, { type: GSC_SYNC_JOB, siteId, source: "manual" });
    dispatchJob(db, job);

    return Response.json(
      { jobId: job.id, status: job.status, ...(!created && { alreadyActive: true }) },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error queueing GSC sync:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync GSC data",
      },
      { status: 500 }
    );
  }
}
