import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleIssueFilter } from "@/lib/crawler/issue-filter";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { requestCrawl } from "@/lib/jobs/site-jobs";

// On a serverless host the crawl runs after the response, within this limit
// (SERVERLESS_MAX_DURATION_S in lib/jobs/config.ts; Next needs a literal here).
export const maxDuration = 300;

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
      select: { userId: true, domain: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // The page count the browser asks for; requestCrawl clamps it to the
    // server's ceiling and asks the crawl policy.
    let requested: unknown;
    try {
      requested = ((await req.json()) as { maxPages?: unknown }).maxPages;
    } catch {
      // No body or invalid JSON: use defaults
    }

    const result = await requestCrawl(
      db,
      { id: siteId, userId: site.userId },
      { maxPages: requested, source: "manual" }
    );
    if (result.status === "refused") {
      return Response.json({ error: result.reason }, { status: result.httpStatus });
    }

    // One crawl per site at a time. A crawl job that is only queued (scheduled,
    // or waiting to retry) now runs next with this request's page count; on a
    // serverless host, where nothing polls the queue, this request runs it.
    const { job } = result;
    if (result.status === "active" && job.status === "RUNNING") {
      return Response.json(
        { error: "A crawl is already running", jobId: job.id, crawlId: job.crawlId },
        { status: 409 }
      );
    }

    dispatchJob(db, job);
    return Response.json(
      {
        jobId: job.id,
        status: job.status,
        maxPages: (job.payload as { maxPages?: number } | null)?.maxPages,
        ...(result.status === "active" && { alreadyActive: true }),
      },
      { status: 202 }
    );
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
          where: visibleIssueFilter(),
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
