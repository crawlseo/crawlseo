import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { inspectUrl } from "@/lib/google/url-inspection-client";
import { ReauthRequiredError } from "@/lib/google/google-auth";
import { getTopPages } from "@/lib/seo-metrics";

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
      select: { userId: true, domain: true, gscProperty: true },
    });

    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (!site.gscProperty) {
      return Response.json({ error: "No GSC property" }, { status: 400 });
    }

    const pages = await getTopPages(siteId, 28, 8);
    const urls =
      pages.length > 0
        ? pages.map((p) =>
            p.url.startsWith("http")
              ? p.url
              : `https://${site.domain}${p.url.startsWith("/") ? "" : "/"}${p.url}`
          )
        : [`https://${site.domain}`];

    const results = [];
    for (const url of urls) {
      try {
        const data = await inspectUrl(
          session.user.id,
          site.gscProperty,
          url
        );
        const status = data.inspectionResult?.indexStatusResult;
        results.push({
          url,
          ok: true,
          coverageState: status?.coverageState ?? "Unknown",
          indexingState: status?.indexingState,
          lastCrawlTime: status?.lastCrawlTime,
          verdict: status?.verdict,
          robotsTxtState: status?.robotsTxtState,
        });
      } catch (err) {
        if (err instanceof ReauthRequiredError) {
          return Response.json(
            { error: err.message, code: "REAUTH_REQUIRED" },
            { status: 401 }
          );
        }
        results.push({
          url,
          ok: false,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    }

    return Response.json({ results });
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      return Response.json(
        { error: error.message, code: "REAUTH_REQUIRED" },
        { status: 401 }
      );
    }

    console.error(error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
