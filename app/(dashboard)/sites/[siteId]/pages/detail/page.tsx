import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  MetricTable,
  PositionBadge,
  NumCell,
  CtrCell,
} from "@/components/ui/data-table";
import {
  AreaMetricChart,
  type AreaMetricPoint,
} from "@/components/research/area-metric-chart";
import { formatCompact, formatCtr } from "@/lib/seo-metrics";
import { getDateRange } from "@/lib/date-utils";

interface Props {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ url?: string }>;
}

export default async function PageDetailPage({ params, searchParams }: Props) {
  const session = await auth();
  const { siteId } = await params;
  const { url } = await searchParams;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");
  if (!url) notFound();

  const { start, end } = getDateRange(28);
  const summaryStart = new Date(`${start}T00:00:00.000Z`);
  const summaryEnd = new Date(`${end}T23:59:59.999Z`);
  const historyStart = new Date();
  historyStart.setUTCDate(historyStart.getUTCDate() - 90);
  historyStart.setUTCHours(0, 0, 0, 0);

  const [summaryRows, historyRows, queryRows] = await Promise.all([
    db.page.findMany({
      where: { siteId, url, date: { gte: summaryStart, lte: summaryEnd } },
      select: { clicks: true, impressions: true, position: true },
    }),
    db.page.findMany({
      where: { siteId, url, date: { gte: historyStart } },
      select: { date: true, clicks: true, impressions: true },
      orderBy: { date: "asc" },
    }),
    db.keyword.findMany({
      where: { siteId, page: url, date: { gte: summaryStart, lte: summaryEnd } },
      select: { query: true, clicks: true, impressions: true, position: true },
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

  // Aggregate 90-day history by date.
  const byDate = new Map<string, AreaMetricPoint>();
  for (const r of historyRows) {
    const date = r.date.toISOString().slice(0, 10);
    const existing = byDate.get(date);
    if (existing) {
      existing.clicks += r.clicks;
      existing.impressions += r.impressions;
    } else {
      byDate.set(date, { date, clicks: r.clicks, impressions: r.impressions });
    }
  }
  const history = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Top queries driving this page.
  const byQuery = new Map<
    string,
    { clicks: number; impressions: number; weightedPos: number }
  >();
  for (const r of queryRows) {
    const existing = byQuery.get(r.query) ?? {
      clicks: 0,
      impressions: 0,
      weightedPos: 0,
    };
    existing.clicks += r.clicks;
    existing.impressions += r.impressions;
    existing.weightedPos += r.position * Math.max(r.impressions, 1);
    byQuery.set(r.query, existing);
  }
  const topQueries = [...byQuery.entries()]
    .map(([query, d]) => {
      const weight = Math.max(d.impressions, 1);
      return {
        query,
        clicks: d.clicks,
        impressions: d.impressions,
        position: d.weightedPos / weight,
        ctr: d.impressions > 0 ? d.clicks / d.impressions : 0,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 25);

  const href = url.startsWith("http")
    ? url
    : `https://${site.domain}${url.startsWith("/") ? "" : "/"}${url}`;

  const hasData = summaryRows.length > 0 || history.length > 0;

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title={url}
        description="Landing page performance and top queries over the last 90 days."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-signal transition hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Open page
            </a>
            <Link
              href={`/sites/${siteId}/pages`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Back to pages
            </Link>
          </div>
        }
      />

      {!hasData ? (
        <EmptyState
          icon="◫"
          title="No data for this page"
          description="This URL has no Search Console rows in the selected window."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Position">
              <PositionBadge position={weightedPos} />
            </StatCard>
            <StatCard label="Clicks" value={formatCompact(clicks)} />
            <StatCard label="Impressions" value={formatCompact(impressions)} />
            <StatCard label="CTR" value={formatCtr(ctr)} />
          </div>

          <AreaMetricChart data={history} title="Page traffic" />

          {topQueries.length > 0 && (
            <MetricTable
              headers={[
                { label: "Query" },
                { label: "Position", align: "right" },
                { label: "Clicks", align: "right" },
                { label: "Impressions", align: "right" },
                { label: "CTR", align: "right" },
              ]}
              footer={`Top ${topQueries.length} queries for this page · last 28 days`}
            >
              {topQueries.map((kw) => (
                <tr key={kw.query} className="transition-colors hover:bg-muted/25">
                  <td className="max-w-md px-4 py-3">
                    <Link
                      href={`/sites/${siteId}/keywords/detail?query=${encodeURIComponent(kw.query)}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {kw.query}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PositionBadge position={kw.position} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <NumCell value={kw.clicks} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <NumCell value={kw.impressions} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CtrCell ctr={kw.ctr} />
                  </td>
                </tr>
              ))}
            </MetricTable>
          )}
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
  title: "Page detail",
};
