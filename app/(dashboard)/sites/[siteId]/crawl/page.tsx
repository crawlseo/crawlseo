import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CrawlButton } from "@/components/sites/action-buttons";
import { CrawlStatusPoller } from "@/components/sites/crawl-status-poller";
import { CrawlFailedNotice } from "@/components/sites/crawl-failed-notice";
import { CrawledPagesTable } from "@/components/sites/crawled-pages-table";
import { RobotsPanel } from "@/components/sites/robots-panel";
import { cn } from "@/lib/utils";
import { getVisibleIssues } from "@/lib/crawler/issue-filter";
import { getCrawlActivity } from "@/lib/crawler/lifecycle";
import {
  crawledPageColumns,
  getCrawlPageStats,
  getCrawlRobotsReport,
} from "@/lib/crawler/page-stats";
import { getT } from "@/lib/i18n/server";
import { REMEDIATION } from "@/lib/crawler/remediation";

const ISSUE_ROWS = 200;

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function CrawlPage({ params }: Props) {
  const t = await getT();
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");

  const latest = await db.crawl.findFirst({
    where: { siteId, status: "COMPLETED" },
    orderBy: { finishedAt: "desc" },
  });

  // A crawl in progress, or the failure of the last attempt since `latest`.
  // A crawl whose process died shows as failed, not in progress (#57).
  const { active: runningCrawl, failed: failedCrawl } = await getCrawlActivity(
    db,
    siteId,
    latest?.finishedAt ?? null,
  );

  // Issues a user sees (no crawl summary or content score rows). The table
  // lists up to ISSUE_ROWS of them; the counts cover all of them.
  const {
    issues,
    total: issueTotal,
    bySeverity,
  } = latest
    ? await getVisibleIssues(db, latest.id, ISSUE_ROWS)
    : {
        issues: [],
        total: 0,
        bySeverity: { CRITICAL: 0, WARNING: 0, INFO: 0 },
      };

  // Page counts come from the database over every stored page, and the table
  // gets every row (a crawl stores at most 2000), so no count depends on a
  // capped list (#56).
  const [pageStats, auditPages, robotsReport] = latest
    ? await Promise.all([
        getCrawlPageStats(db, latest.id),
        db.auditPage.findMany({
          where: { crawlId: latest.id },
          orderBy: [{ contentScore: "desc" }, { url: "asc" }],
          select: crawledPageColumns,
        }),
        getCrawlRobotsReport(db, latest.id),
      ])
    : [{ pages: 0, avgContentScore: null, orphans: 0 }, [], null];
  const { avgContentScore, orphans: orphanCount } = pageStats;

  const crawledAt = latest?.finishedAt
    ? t.date(latest.finishedAt, { time: true })
    : null;

  return (
    <div>
      <PageHeader
        title={t("Crawl / Audit")}
        meta={
          latest
            ? t("Crawl {0} · {1} crawled", {
                "0": crawledAt,
                "1": t("counts.pages", { count: pageStats.pages }),
              })
            : t("No crawl yet")
        }
        actions={<CrawlButton siteId={siteId} />}
      />

      {/* Running crawl indicator */}
      {runningCrawl && (
        <CrawlStatusPoller
          key={runningCrawl.id}
          siteId={siteId}
          crawlId={runningCrawl.id}
        />
      )}
      {failedCrawl && (
        <CrawlFailedNotice
          error={failedCrawl.error}
          finishedAt={failedCrawl.finishedAt}
        />
      )}

      {!latest ? (
        <EmptyState
          icon="◎"
          title={t("No crawl yet")}
          description={t(
            "Run a crawl to check titles, H1s, canonicals, broken pages, sitemap coverage, and on-page content scores.",
          )}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="panel col-span-2 flex flex-col gap-2.5 px-5 py-[18px] lg:col-span-1">
              <span className="text-[13px] leading-5 text-muted-foreground">
                {t("Health")}
              </span>
              <span className="font-data text-[40px] leading-[44px] font-medium tracking-[-0.03em] text-text-strong">
                {latest.healthScore ?? "n/a"}
                <span className="ml-1 text-[15px] tracking-normal text-muted-foreground">
                  /100
                </span>
              </span>
              <span className="mono-label text-[11px] leading-[1.5] text-muted-foreground">
                {t("Latest completed crawl · content avg")}{" "}
                {avgContentScore ?? "n/a"}/100
              </span>
            </div>
            <CountCard
              label={t("Critical")}
              n={bySeverity.CRITICAL}
              note={t("Blocks indexing or users")}
              tone="danger"
            />
            <CountCard
              label={t("Warning")}
              n={bySeverity.WARNING}
              note={t("Hurts ranking")}
              tone="warning"
            />
            <CountCard
              label={t("Info")}
              n={bySeverity.INFO}
              note={t("Worth knowing")}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[2.3fr_1fr]">
            {/* Issues list with remediation */}
            <section className="panel overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-1.5">
                <h2 className="text-[15px] leading-5 font-semibold">
                  {t("Issues")}
                </h2>
                <span className="mono-label text-[11px] text-muted-foreground">
                  {t("counts.issues", { count: issueTotal })}
                </span>
              </div>
              {issueTotal === 0 ? (
                <p className="px-4 pt-2 pb-6 text-[13px] text-muted-foreground">
                  {t("No issues found")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={th}>{t("Severity")}</th>
                        <th className={th}>{t("Issue")}</th>
                        <th className={th}>{t("Page")}</th>
                        <th className={th}>{t("Type")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {issues.map((issue) => {
                        const details = issue.details as {
                          howToFix?: string;
                          kind?: string;
                        } | null;
                        return (
                          <tr key={issue.id} className="align-top">
                            <td className="px-4 py-3">
                              <SeverityChip
                                severity={issue.severity}
                                label={t(issue.severity.toLowerCase())}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-text-strong">
                                {t.stored(issue.message)}
                              </p>
                              {details?.howToFix && (
                                <p className="mt-1 text-[12px] leading-[18px] text-muted-foreground">
                                  <span className="font-medium text-text">
                                    {t("Fix:")}{" "}
                                  </span>
                                  {t.stored(details.howToFix)}
                                </p>
                              )}
                            </td>
                            <td
                              className="max-w-[260px] truncate px-4 py-3 font-data text-[12px]"
                              title={issue.url}
                            >
                              {pathOf(issue.url)}
                            </td>
                            <td className="px-4 py-3 mono-label text-[11px] whitespace-nowrap text-muted-foreground">
                              {t(
                                REMEDIATION[issue.type]?.title ??
                                  issue.type.replace(/_/g, " "),
                              )}
                              {details?.kind === "orphan"
                                ? ` · ${t("Orphan page")}`
                                : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {issueTotal > issues.length && (
                    <p className="border-t border-border bg-bg-soft px-4 py-3 text-[12px] text-muted-foreground">
                      {t("Showing")} {issues.length} {t("of")} {issueTotal}{" "}
                      {t("issues, most severe first")}{" "}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="panel flex flex-col gap-2.5 self-start px-5 py-[18px]">
              <h2 className="text-[15px] leading-5 font-semibold">
                {t("Internal links")}
              </h2>
              <div className="flex justify-between gap-3 text-[13px]">
                <span>{t("Orphans (no inbound link)")}</span>
                <span className="font-data text-text-strong">
                  {orphanCount}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-[13px]">
                <span>{t("Content score, average")}</span>
                <span className="font-data text-text-strong">
                  {avgContentScore ?? "n/a"}
                </span>
              </div>
              <a href="#crawled-pages" className="text-link text-[13px]">
                {t("See them in Crawled pages")}{" "}
              </a>
            </section>
          </div>

          {robotsReport && <RobotsPanel report={robotsReport} />}

          {/* Crawled pages table (from AuditPage model) */}
          {pageStats.pages > 0 && (
            <section id="crawled-pages" className="scroll-mt-6">
              <div className="flex flex-col gap-1 px-1 pb-3">
                <h2 className="text-[15px] leading-5 font-semibold">
                  {t("Crawled pages")}
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  {t("counts.pages", { count: pageStats.pages })}
                  {t(", each stored with full metadata")}{" "}
                </p>
              </div>
              <CrawledPagesTable rows={auditPages} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const th =
  "mono-label px-4 py-2.5 text-left text-[11px] font-normal text-muted-foreground";

function pathOf(url: string) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function SeverityChip({
  severity,
  label,
}: {
  severity: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "mono-label inline-flex rounded-md border px-2 py-0.5 text-[11px] whitespace-nowrap",
        severity === "CRITICAL" && "border-danger/30 bg-danger-bg text-danger",
        severity === "WARNING" &&
          "border-warning/30 bg-warning-bg text-warning",
        severity === "INFO" && "border-border text-text",
      )}
    >
      {label}
    </span>
  );
}

function CountCard({
  label,
  n,
  note,
  tone,
}: {
  label: string;
  n: number;
  note: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="panel flex flex-col gap-2.5 px-5 py-[18px]">
      <span className="text-[13px] leading-5 text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-data text-[30px] leading-9 font-medium",
          tone === "danger"
            ? "text-danger"
            : tone === "warning"
              ? "text-warning"
              : "text-text-strong",
        )}
      >
        {n}
      </span>
      <span className="text-[12px] leading-4 text-muted-foreground">
        {note}
      </span>
    </div>
  );
}
