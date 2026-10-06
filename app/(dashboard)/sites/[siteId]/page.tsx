import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { DashboardMetrics } from "@/components/dashboard/metrics";
import { TrafficChart } from "@/components/dashboard/traffic-chart";
import { TopKeywords } from "@/components/dashboard/top-keywords";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncButton } from "@/components/sites/sync-button";
import {
  CrawlButton,
  VitalsButton,
} from "@/components/sites/action-buttons";
import { CsvExportButton } from "@/components/ui/csv-export-button";
import { getAllOpportunities } from "@/lib/seo-opportunities";
import { countVisibleIssues } from "@/lib/crawler/issue-filter";
import { getCrawlActivity } from "@/lib/crawler/lifecycle";
import { cn } from "@/lib/utils";

interface SitePageProps {
  params: Promise<{ siteId: string }>;
}

export default async function SiteOverviewPage({ params }: SitePageProps) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      userId: true,
      domain: true,
      gscProperty: true,
      _count: { select: { keywords: true, pages: true } },
    },
  });

  if (!site || site.userId !== session?.user?.id) {
    redirect("/sites");
  }

  const latestCrawl = await db.crawl.findFirst({
    where: { siteId, status: "COMPLETED" },
    orderBy: { finishedAt: "desc" },
    select: { id: true, healthScore: true, pagesFound: true, finishedAt: true },
  });
  // Counted live with the Crawl / Audit page's rule, so both screens agree,
  // also for crawls stored before issuesFound left out the internal rows.
  const latestIssueCount = latestCrawl ? await countVisibleIssues(db, latestCrawl.id) : 0;
  // A crawl in progress, or the failure of the last attempt since latestCrawl (#57).
  const crawlActivity = await getCrawlActivity(db, siteId, latestCrawl?.finishedAt ?? null);

  const latestVital = await db.vitalsReport.findFirst({
    where: { siteId },
    orderBy: { date: "desc" },
    select: { perfScore: true, lcp: true, url: true },
  });

  // Search Console anonymises the query dimension on low-traffic sites, so a
  // synced site can have pages but no keywords. Either one means data arrived.
  const hasData = site._count.keywords > 0 || site._count.pages > 0;

  const opportunities = hasData ? await getAllOpportunities(siteId) : null;

  return (
    <div>
      <PageHeader
        title="Overview"
        meta="Last 28 days vs the previous 28 days"
        description={<span className="font-data">{site.gscProperty || site.domain}</span>}
        actions={
          <>
            <SyncButton siteId={siteId} />
            <CrawlButton siteId={siteId} />
            <VitalsButton siteId={siteId} />
          </>
        }
      />

      {!hasData ? (
        <EmptyState
          icon="↻"
          title="Waiting for GSC data"
          description="Run a sync to pull keywords, pages, and traffic for the last 28 days."
        />
      ) : (
        <div className="flex flex-col gap-[22px]">
          <DashboardMetrics siteId={siteId} />
          <TrafficChart siteId={siteId} />

          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TopKeywords siteId={siteId} />

            <section className="panel flex flex-col gap-3 self-start px-5 py-[18px]">
              <h2 className="text-[15px] leading-5 font-semibold">Site checks</h2>
              <CheckRow
                label="Crawl health"
                value={latestCrawl?.healthScore != null ? `${latestCrawl.healthScore}/100` : "n/a"}
              />
              <CheckRow
                label="Crawl"
                value={
                  latestCrawl
                    ? `${latestCrawl.pagesFound} pages · ${latestIssueCount} issues`
                    : "Not run yet"
                }
              />
              {crawlActivity.active && <CheckRow label="Last crawl" value="Running" />}
              {crawlActivity.failed && (
                <div className="flex flex-col gap-0.5">
                  <CheckRow label="Last crawl" value="Failed" tone="danger" />
                  <p className="text-[12px] leading-4 text-muted-foreground">
                    {crawlActivity.failed.error ?? "No reason was recorded."}
                  </p>
                </div>
              )}
              <CheckRow label="Opportunities" value={String(opportunities?.feed.length ?? 0)} />
              <CheckRow
                label="Latest perf score"
                value={latestVital?.perfScore != null ? String(latestVital.perfScore) : "n/a"}
              />
              {latestVital?.url && (
                <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
                  <span className="shrink-0 text-text">Tested URL</span>
                  <span className="truncate font-data text-[12px] text-text-strong" title={latestVital.url}>
                    {latestVital.url.replace(/^https?:\/\//, "")}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[13px]">
                <Link href={`/sites/${siteId}/crawl`} className="text-link">
                  Crawl / Audit
                </Link>
                <Link href={`/sites/${siteId}/opportunities`} className="text-link">
                  Opportunities
                </Link>
                <Link href={`/sites/${siteId}/vitals`} className="text-link">
                  Vitals
                </Link>
              </div>
            </section>
          </div>

          <div className="flex flex-wrap gap-2">
            <CsvExportButton siteId={siteId} type="keywords" />
            <CsvExportButton siteId={siteId} type="pages" />
          </div>
        </div>
      )}
    </div>
  );
}

function CheckRow({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
      <span className="text-text">{label}</span>
      {/* Numbers in mono; words only in mono uppercase. */}
      <span
        className={cn(
          /^[\d.,/%]+$/.test(value) ? "font-data" : "mono-label text-[12px]",
          tone === "danger" ? "text-danger" : "text-text-strong"
        )}
      >
        {value}
      </span>
    </div>
  );
}
