import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getTopPages } from "@/lib/seo-metrics";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncButton } from "@/components/sites/sync-button";
import { CsvExportButton } from "@/components/ui/csv-export-button";
import { DataLagBadge } from "@/components/ui/data-lag-badge";
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
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DataLagBadge />
            <CsvExportButton siteId={siteId} type="pages" />
            <SyncButton siteId={siteId} />
          </div>
        }
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
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/sites/${siteId}/pages/detail?url=${encodeURIComponent(page.url)}`}
                      className="break-all font-medium text-foreground transition hover:text-primary hover:underline"
                    >
                      {page.url}
                    </Link>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground transition hover:text-signal"
                      title="Open page in new tab"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
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
