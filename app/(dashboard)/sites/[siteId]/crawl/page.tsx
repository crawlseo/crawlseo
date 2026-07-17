import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CrawlButton } from "@/components/sites/action-buttons";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function CrawlPage({ params }: Props) {
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
    include: {
      issues: { orderBy: [{ severity: "asc" }, { type: "asc" }], take: 300 },
    },
  });

  const summaryIssue = latest?.issues.find(
    (i) => (i.details as { kind?: string } | null)?.kind === "crawl_summary"
  );
  const summary = summaryIssue?.details as {
    pages?: {
      url: string;
      contentScore: number;
      wordCount: number;
      inlinks: number;
      outlinks: number;
      statusCode: number;
      title: string | null;
    }[];
    sitemapUrls?: number;
    missingFromSitemap?: number;
    orphans?: number;
    avgContentScore?: number;
  } | null;

  const realIssues =
    latest?.issues.filter((i) => {
      const kind = (i.details as { kind?: string } | null)?.kind;
      return kind !== "crawl_summary" && kind !== "content_score";
    }) || [];

  const contentScores =
    latest?.issues.filter(
      (i) => (i.details as { kind?: string } | null)?.kind === "content_score"
    ) || [];

  const bySeverity = {
    CRITICAL: realIssues.filter((i) => i.severity === "CRITICAL").length,
    WARNING: realIssues.filter((i) => i.severity === "WARNING").length,
    INFO: realIssues.filter((i) => i.severity === "INFO").length,
  };

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="Site crawl"
        description="Technical SEO audit · meta, headings, schema, sitemap, orphans, content score"
        actions={<CrawlButton siteId={siteId} />}
      />

      {!latest ? (
        <EmptyState
          icon="◎"
          title="No crawl yet"
          description="Run a crawl to check titles, H1s, canonicals, broken pages, sitemap coverage, and on-page content scores."
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <ScoreCard
              label="Health"
              value={`${latest.healthScore ?? "—"}`}
              hint="/100"
              tone={(latest.healthScore ?? 0) >= 80 ? "good" : (latest.healthScore ?? 0) >= 60 ? "mid" : "bad"}
            />
            <ScoreCard label="Pages" value={String(latest.pagesFound)} hint="crawled" />
            <ScoreCard label="Issues" value={String(realIssues.length)} hint={`${bySeverity.CRITICAL} critical`} />
            <ScoreCard
              label="Content avg"
              value={String(summary?.avgContentScore ?? "—")}
              hint="/100"
            />
            <ScoreCard
              label="Orphans"
              value={String(summary?.orphans ?? "—")}
              hint="no inlinks"
            />
          </div>

          {summary?.pages && summary.pages.length > 0 && (
            <div className="panel overflow-hidden">
              <div className="border-b border-border/60 px-5 py-4">
                <h3 className="font-heading text-lg font-semibold">Crawled pages</h3>
                <p className="text-sm text-muted-foreground">
                  Sitemap URLs: {summary.sitemapUrls ?? 0} · missing from sitemap:{" "}
                  {summary.missingFromSitemap ?? 0}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/20 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="px-4 py-3 text-left">URL</th>
                      <th className="px-4 py-3 text-right">Score</th>
                      <th className="px-4 py-3 text-right">Words</th>
                      <th className="px-4 py-3 text-right">In</th>
                      <th className="px-4 py-3 text-right">Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {summary.pages.map((p) => (
                      <tr key={p.url} className="hover:bg-muted/20">
                        <td className="max-w-md truncate px-4 py-2.5 font-medium">
                          {p.url}
                        </td>
                        <td className="px-4 py-2.5 text-right font-data">
                          <span
                            className={cn(
                              p.contentScore >= 70
                                ? "text-signal"
                                : p.contentScore >= 50
                                  ? "text-warning"
                                  : "text-danger"
                            )}
                          >
                            {p.contentScore}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                          {p.wordCount}
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                          {p.inlinks}
                        </td>
                        <td className="px-4 py-2.5 text-right font-data text-muted-foreground">
                          {p.outlinks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="panel overflow-hidden">
            <div className="border-b border-border/60 px-5 py-4">
              <h3 className="font-heading text-lg font-semibold">Issues</h3>
              <p className="text-sm text-muted-foreground">
                Critical {bySeverity.CRITICAL} · Warning {bySeverity.WARNING} · Info{" "}
                {bySeverity.INFO}
              </p>
            </div>
            {realIssues.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">No issues found 🎉</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {realIssues.slice(0, 100).map((issue) => (
                  <li key={issue.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{issue.message}</p>
                      <p className="truncate text-xs text-muted-foreground">{issue.url}</p>
                      <p className="mt-0.5 font-data text-[11px] text-muted-foreground">
                        {issue.type}
                        {(issue.details as { kind?: string } | null)?.kind === "orphan"
                          ? " · orphan"
                          : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        issue.severity === "CRITICAL" && "bg-danger/15 text-danger",
                        issue.severity === "WARNING" && "bg-warning/15 text-warning",
                        issue.severity === "INFO" && "bg-muted text-muted-foreground"
                      )}
                    >
                      {issue.severity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {contentScores.length > 0 && (
            <div className="panel p-5">
              <h3 className="font-heading text-lg font-semibold">Low content scores</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                On-page heuristic (title, meta, H1, length, schema)
              </p>
              <ul className="space-y-2">
                {contentScores.map((c) => (
                  <li key={c.id} className="text-sm text-muted-foreground">
                    <span className="text-foreground">{c.message}</span>
                    <span className="block truncate text-xs">{c.url}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "mid" | "bad";
}) {
  return (
    <div className="panel p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-heading text-2xl font-semibold",
          tone === "good" && "text-signal",
          tone === "mid" && "text-warning",
          tone === "bad" && "text-danger"
        )}
      >
        {value}
        {hint && (
          <span className="ml-1 text-sm font-normal text-muted-foreground">{hint}</span>
        )}
      </p>
    </div>
  );
}
