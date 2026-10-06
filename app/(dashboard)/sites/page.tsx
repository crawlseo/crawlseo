import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSiteModal } from "@/components/sites/add-site-modal";
import { SyncButton } from "@/components/sites/sync-button";
import { formatCompact } from "@/lib/seo-metrics";
import { formatDay } from "@/lib/format";

export default async function SitesPage() {
  const session = await auth();

  const sites = await db.site.findMany({
    where: { userId: session?.user?.id },
    select: {
      id: true,
      domain: true,
      gscProperty: true,
      createdAt: true,
      _count: {
        select: {
          keywords: true,
          pages: true,
          crawls: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Sites"
        description="Connect and sync Google Search Console properties."
        actions={<AddSiteModal />}
      />

      {sites.length === 0 ? (
        <EmptyState
          icon="⊕"
          title="Connect your first property"
          description="Choose a domain or URL-prefix property from Search Console. crawlseo stores your metrics locally."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => (
            <div key={site.id} className="panel flex h-full flex-col p-5">
              <Link href={`/sites/${site.id}`} className="group block min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-data text-[17px] leading-6 font-medium text-text-strong decoration-brand-500 underline-offset-4 group-hover:underline">
                      {site.domain}
                    </h2>
                    <p className="mt-1 truncate font-data text-xs text-muted-foreground">
                      {site.gscProperty}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
                  <MiniStat
                    label="Keyword rows"
                    value={formatCompact(site._count.keywords)}
                  />
                  <MiniStat
                    label="Page rows"
                    value={formatCompact(site._count.pages)}
                  />
                  <MiniStat
                    label="Crawls"
                    value={String(site._count.crawls)}
                  />
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  Added{" "}
                  {formatDay(site.createdAt, { year: true })}
                </p>
              </Link>

              <div className="mt-4 border-t border-border pt-4">
                <SyncButton siteId={site.id} fullWidth />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mono-label text-[11px] text-muted-foreground">
        {label}
      </p>
      <p className="font-data mt-0.5 text-[14px] font-medium text-text-strong">
        {value}
      </p>
    </div>
  );
}
