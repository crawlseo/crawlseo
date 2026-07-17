import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getTopPages } from "@/lib/seo-metrics";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncButton } from "@/components/sites/sync-button";
import {
  PositionBadge,
  MetricTable,
  CtrCell,
  NumCell,
} from "@/components/ui/data-table";

interface PagesPageProps {
  params: Promise<{ siteId: string }>;
}

export default async function PagesPage({ params }: PagesPageProps) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });

  if (!site || site.userId !== session?.user?.id) {
    redirect("/sites");
  }

  const pages = await getTopPages(siteId, 28, 100);

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="Pages"
        description="Landing pages from Search Console, aggregated over the last 28 days."
        actions={<SyncButton siteId={siteId} />}
      />

      {pages.length === 0 ? (
        <EmptyState
          icon="◫"
          title="No pages yet"
          description="Sync GSC to pull page-level clicks, impressions, and positions."
        />
      ) : (
        <MetricTable
          headers={[
            { label: "URL" },
            { label: "Position", align: "right" },
            { label: "Clicks", align: "right" },
            { label: "Impressions", align: "right" },
            { label: "CTR", align: "right" },
          ]}
          footer={`Showing ${pages.length} pages · sorted by clicks`}
        >
          {pages.map((page) => {
            const href = page.url.startsWith("http")
              ? page.url
              : `https://${site.domain}${page.url.startsWith("/") ? "" : "/"}${page.url}`;

            return (
              <tr
                key={page.url}
                className="transition-colors hover:bg-muted/25"
              >
                <td className="max-w-xl px-4 py-3">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all font-medium text-signal hover:underline"
                  >
                    {page.url}
                  </a>
                </td>
                <td className="px-4 py-3 text-right">
                  <PositionBadge position={page.position} />
                </td>
                <td className="px-4 py-3 text-right">
                  <NumCell value={page.clicks} />
                </td>
                <td className="px-4 py-3 text-right">
                  <NumCell value={page.impressions} />
                </td>
                <td className="px-4 py-3 text-right">
                  <CtrCell ctr={page.ctr} />
                </td>
              </tr>
            );
          })}
        </MetricTable>
      )}
    </div>
  );
}
