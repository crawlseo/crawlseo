import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { BING_SYNC_JOB } from "@/lib/jobs/handlers";
import { requestSiteJob } from "@/lib/jobs/site-jobs";

/**
 * Queues a Bing sync for the site and answers 202 with the job id. The client
 * polls GET /api/jobs/[jobId]; the job's result has the fields this route used
 * to return (daysUpserted, queriesUpserted, pagesUpserted, partial).
 */
export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = (await req.json()) as { siteId?: string };
    if (!siteId) {
      return Response.json({ error: "Missing siteId" }, { status: 400 });
    }

    // Same answer as /api/gsc/sync for a site that does not exist and for one
    // that belongs to someone else, so the status does not say which ids exist.
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, bingSite: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json(
        { error: "Site not found or unauthorized" },
        { status: 404 }
      );
    }

    if (!site.bingSite) {
      return Response.json(
        { error: "Site does not have a Bing Webmaster property connected" },
        { status: 400 }
      );
    }

    const { job, created } = await requestSiteJob(db, { type: BING_SYNC_JOB, siteId, source: "manual" });
    dispatchJob(db, job);

    return Response.json(
      { jobId: job.id, status: job.status, ...(!created && { alreadyActive: true }) },
      { status: 202 }
    );
  } catch (error) {
    console.error("Bing sync error:", error);

    return Response.json(
      { error: error instanceof Error ? error.message : "Bing sync failed" },
      { status: 500 }
    );
  }
}
