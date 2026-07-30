import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SaveKeywordForm, DeleteKeywordButton } from "@/components/sites/saved-keyword-actions";
import { PositionBadge, NumCell, CtrCell } from "@/components/ui/data-table";
import { getDateRange } from "@/lib/date-utils";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function SavedKeywordsPage({ params }: Props) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");

  const saved = await db.savedKeyword.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
  });

  // Get latest keyword data for saved queries
  const { start, end } = getDateRange(28);
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T23:59:59.999Z`);

  const keywordData = saved.length > 0
    ? await db.keyword.groupBy({
        by: ["query"],
        where: {
          siteId,
          query: { in: saved.map((s) => s.query) },
          date: { gte: startDate, lte: endDate },
        },
        _sum: { clicks: true, impressions: true },
        _avg: { position: true, ctr: true },
      })
    : [];

  const dataMap = new Map(
    keywordData.map((k) => [k.query, {
      clicks: k._sum.clicks ?? 0,
      impressions: k._sum.impressions ?? 0,
      position: k._avg.position ?? 0,
      ctr: k._avg.ctr ?? 0,
    }])
  );

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="Saved Keywords"
        description="Track specific keywords over time"
        actions={<SaveKeywordForm siteId={siteId} />}
      />

      {saved.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="No saved keywords"
          description="Save keywords you want to track closely. Use the form above to add your first keyword."
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/30">
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Keyword
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Tags
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Notes
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Position
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Clicks
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Impr.
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    CTR
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {saved.map((kw) => {
                  const data = dataMap.get(kw.query);
                  return (
                    <tr key={kw.id} className="transition-colors hover:bg-muted/25">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link
                          href={`/sites/${siteId}/keywords/detail?query=${encodeURIComponent(kw.query)}`}
                          className="transition hover:text-primary hover:underline"
                        >
                          {kw.query}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {kw.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {kw.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                        {kw.notes || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {data ? <PositionBadge position={data.position} /> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {data ? <NumCell value={data.clicks} /> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {data ? <NumCell value={data.impressions} /> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {data ? <CtrCell ctr={data.ctr} /> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DeleteKeywordButton siteId={siteId} query={kw.query} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            {saved.length} saved keywords · last 28 days aggregated
          </div>
        </div>
      )}
    </div>
  );
}
