import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getTopKeywords } from "@/lib/seo-metrics";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncButton } from "@/components/sites/sync-button";
import {
  PositionBadge,
  MetricTable,
  CtrCell,
  NumCell,
} from "@/components/ui/data-table";

interface KeywordsPageProps {
  params: Promise<{ siteId: string }>;
}

export default async function KeywordsPage({ params }: KeywordsPageProps) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });

  if (!site || site.userId !== session?.user?.id) {
    redirect("/sites");
  }

  const keywords = await getTopKeywords(siteId, 28, 100);

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="Keywords"
        description="Queries with impressions in the last 28 days, aggregated across days."
        actions={<SyncButton siteId={siteId} />}
      />

      {keywords.length === 0 ? (
        <EmptyState
          icon="⌘"
          title="No keywords yet"
          description="Sync Google Search Console to populate query-level performance."
        />
      ) : (
        <MetricTable
          headers={[
            { label: "Query" },
            { label: "Position", align: "right" },
            { label: "Clicks", align: "right" },
            { label: "Impressions", align: "right" },
            { label: "CTR", align: "right" },
          ]}
          footer={`Showing ${keywords.length} keywords · sorted by clicks`}
        >
          {keywords.map((keyword) => (
            <tr
              key={keyword.query}
              className="transition-colors hover:bg-muted/25"
            >
              <td className="max-w-md px-4 py-3">
                <span className="font-medium text-foreground">{keyword.query}</span>
              </td>
              <td className="px-4 py-3 text-right">
                <PositionBadge position={keyword.position} />
              </td>
              <td className="px-4 py-3 text-right">
                <NumCell value={keyword.clicks} />
              </td>
              <td className="px-4 py-3 text-right">
                <NumCell value={keyword.impressions} />
              </td>
              <td className="px-4 py-3 text-right">
                <CtrCell ctr={keyword.ctr} />
              </td>
            </tr>
          ))}
        </MetricTable>
      )}
    </div>
  );
}
