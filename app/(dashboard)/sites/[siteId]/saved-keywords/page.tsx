import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SaveKeywordForm } from "@/components/sites/saved-keyword-actions";
import { SavedKeywordsTable } from "@/components/sites/saved-keywords-table";
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
        <SavedKeywordsTable
          siteId={siteId}
          rows={saved.map((kw) => {
            const data = dataMap.get(kw.query);
            return {
              id: kw.id,
              query: kw.query,
              notes: kw.notes,
              position: data?.position ?? null,
              clicks: data?.clicks ?? null,
              impressions: data?.impressions ?? null,
              ctr: data?.ctr ?? null,
            };
          })}
        />
      )}
    </div>
  );
}
