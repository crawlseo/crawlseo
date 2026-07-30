import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PositionBadge } from "@/components/ui/data-table";
import {
  RankHistoryChart,
  type RankHistoryPoint,
} from "@/components/research/rank-history-chart";
import { KeywordSavePanel } from "@/components/research/keyword-save-panel";
import { formatCompact, formatCtr } from "@/lib/seo-metrics";
import { getDateRange } from "@/lib/date-utils";

interface Props {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ query?: string }>;
}

export default async function KeywordDetailPage({ params, searchParams }: Props) {
  const session = await auth();
  const { siteId } = await params;
  const { query } = await searchParams;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");
  if (!query) notFound();

  // 28-day aggregate for the summary + a 90-day series for the chart.
  const { start, end } = getDateRange(28);
  const summaryStart = new Date(`${start}T00:00:00.000Z`);
  const summaryEnd = new Date(`${end}T23:59:59.999Z`);
  const historyStart = new Date();
  historyStart.setUTCDate(historyStart.getUTCDate() - 90);
  historyStart.setUTCHours(0, 0, 0, 0);

  const [summaryRows, historyRows, saved] = await Promise.all([
    db.keyword.findMany({
      where: { siteId, query, date: { gte: summaryStart, lte: summaryEnd } },
      select: { clicks: true, impressions: true, position: true, page: true },
    }),
    db.keyword.findMany({
      where: { siteId, query, date: { gte: historyStart } },
      select: { date: true, clicks: true, impressions: true, position: true },
      orderBy: { date: "asc" },
    }),
    db.savedKeyword.findUnique({
      where: { siteId_query: { siteId, query } },
      select: { tags: true, notes: true },
    }),
  ]);

  const clicks = summaryRows.reduce((s, r) => s + r.clicks, 0);
  const impressions = summaryRows.reduce((s, r) => s + r.impressions, 0);
  const weightedPos =
    summaryRows.reduce((s, r) => s + r.position * Math.max(r.impressions, 1), 0) /
    Math.max(
      summaryRows.reduce((s, r) => s + Math.max(r.impressions, 1), 0),
      1
    );
  const ctr = impressions > 0 ? clicks / impressions : 0;

  // Top landing page for this query over the window.
  const pageClicks = new Map<string, number>();
  for (const r of summaryRows) {
    if (!r.page) continue;
    pageClicks.set(r.page, (pageClicks.get(r.page) ?? 0) + r.clicks);
  }
  const topPage = [...pageClicks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Aggregate history rows by date (impression-weighted position).
  const byDate = new Map<string, RankHistoryPoint>();
  for (const r of historyRows) {
    const date = r.date.toISOString().slice(0, 10);
    const existing = byDate.get(date);
    if (existing) {
      const totalImpr = existing.impressions + r.impressions;
      existing.position =
        totalImpr > 0
          ? (existing.position * existing.impressions + r.position * r.impressions) /
            totalImpr
          : (existing.position + r.position) / 2;
      existing.clicks += r.clicks;
      existing.impressions += r.impressions;
    } else {
      byDate.set(date, {
        date,
        position: r.position,
        clicks: r.clicks,
        impressions: r.impressions,
      });
    }
  }
  const history = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const hasData = summaryRows.length > 0 || history.length > 0;

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title={query}
        description="Keyword performance and rank history over the last 90 days."
        actions={
          <Link
            href={`/sites/${siteId}/keywords`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to keywords
          </Link>
        }
      />

      {!hasData ? (
        <EmptyState
          icon="⌘"
          title="No data for this keyword"
          description="This query has no Search Console rows in the selected window."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Position">
                <PositionBadge position={weightedPos} />
              </StatCard>
              <StatCard label="Clicks" value={formatCompact(clicks)} />
              <StatCard label="Impressions" value={formatCompact(impressions)} />
              <StatCard label="CTR" value={formatCtr(ctr)} />
            </div>

            <RankHistoryChart data={history} />

            {topPage && (
              <div className="panel p-5">
                <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Top landing page
                </p>
                <a
                  href={topPage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-medium text-signal hover:underline"
                >
                  {topPage}
                </a>
                <div className="mt-2">
                  <Link
                    href={`/sites/${siteId}/pages/detail?url=${encodeURIComponent(topPage)}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View page details →
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <KeywordSavePanel
              siteId={siteId}
              query={query}
              initialSaved={saved !== null}
              initialTags={saved?.tags ?? []}
              initialNotes={saved?.notes ?? ""}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel p-4">
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {children ?? (
        <p className="font-data text-atom-subheader font-semibold text-foreground">
          {value}
        </p>
      )}
    </div>
  );
}

export const metadata = {
  title: "Keyword detail",
};
