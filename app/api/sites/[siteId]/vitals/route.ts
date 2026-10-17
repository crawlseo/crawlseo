import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { VITALS_JOB } from "@/lib/jobs/handlers";
import { requestSiteJob } from "@/lib/jobs/site-jobs";

// On a serverless host the check runs after the response, within this limit
// (SERVERLESS_MAX_DURATION_S in lib/jobs/config.ts; Next needs a literal here).
export const maxDuration = 300;

/**
 * Queues a vitals check and answers 202 with the job id. The client polls
 * GET /api/jobs/[jobId]; the job's result has `inserted` and `results`, and an
 * exhausted PageSpeed quota fails it with errorCode QUOTA_EXCEEDED.
 */
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
      select: { userId: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const { job, created } = await requestSiteJob(db, { type: VITALS_JOB, siteId, source: "manual" });
    dispatchJob(db, job);
    return Response.json(
      { jobId: job.id, status: job.status, ...(!created && { alreadyActive: true }) },
      { status: 202 }
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Vitals sync failed" },
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

    const reports = await db.vitalsReport.findMany({
      where: { siteId },
      orderBy: { date: "desc" },
      take: 50,
    });

    return Response.json(reports);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
