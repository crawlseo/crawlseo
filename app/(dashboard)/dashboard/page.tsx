import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSitePeriodMetrics, formatCompact } from "@/lib/seo-metrics";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSiteModal } from "@/components/sites/add-site-modal";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { DataLagBadge } from "@/components/ui/data-lag-badge";
import { formatDeltaPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();

  const sites = await db.site.findMany({
    where: { userId: session?.user?.id },
    select: {
      id: true,
      domain: true,
      gscProperty: true,
      _count: { select: { keywords: true, pages: true, crawls: true } },
    },
    orderBy: { domain: "asc" },
  });

  // Search Console anonymises the query dimension on low-traffic sites, so a
  // synced site can have pages but no keywords. Either one means data arrived.
  const hasData = (s: (typeof sites)[number]) =>
    s._count.keywords > 0 || s._count.pages > 0;

  // Onboarding state
  const hasSites = sites.length > 0;
  const hasGscConnected = sites.some((s) => s.gscProperty);
  const hasSyncedData = sites.some(hasData);
  const hasCrawled = sites.some((s) => s._count.crawls > 0);
  const firstSiteId = sites[0]?.id;

  if (sites.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="Workspace"
          title="Welcome to CrawlSEO"
          description="Connect Google Search Console properties to track rankings, traffic, and opportunity."
          actions={<AddSiteModal triggerLabel="Connect first site" />}
        />
        <OnboardingChecklist
          hasSites={false}
          hasGscConnected={false}
          hasSyncedData={false}
          hasCrawled={false}
        />
        <EmptyState
          icon="↗"
          title="No sites connected"
          description="Import a GSC property to start monitoring organic search performance. Read-only access only."
          actionLabel="Add site"
          actionHref="/sites"
        />
      </div>
    );
  }

  const siteCards = await Promise.all(
    sites.map(async (site) => {
      // Metrics are computed from the Page model (see seo-metrics), so a site
      // whose sync stored pages but no keywords still has real data to show.
      if (!hasData(site)) {
        return {
          site,
          metrics: null as Awaited<ReturnType<typeof getSitePeriodMetrics>> | null,
        };
      }
      try {
        const metrics = await getSitePeriodMetrics(site.id, 28);
        return { site, metrics };
      } catch {
        return { site, metrics: null };
      }
    })
  );

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Portfolio overview"
        description={`${sites.length} site${sites.length === 1 ? "" : "s"} · last 28 days vs prior period`}
        actions={
          <div className="flex items-center gap-3">
            <DataLagBadge />
            <AddSiteModal />
          </div>
        }
      />

      {/* Onboarding checklist */}
      <OnboardingChecklist
        hasSites={hasSites}
        hasGscConnected={hasGscConnected}
        hasSyncedData={hasSyncedData}
        hasCrawled={hasCrawled}
        firstSiteId={firstSiteId}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {siteCards.map(({ site, metrics }) => (
          <Link
            key={site.id}
            href={`/sites/${site.id}`}
            className="panel group relative block overflow-hidden p-5 transition hover:border-signal/40"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/30 to-transparent opacity-0 transition group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-heading text-lg font-semibold text-foreground">
                  {site.domain}
                </h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {site.gscProperty}
                </p>
              </div>
              <span className="text-signal opacity-0 transition group-hover:opacity-100">
                →
              </span>
            </div>

            {!metrics ? (
              <div className="mt-6 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                Waiting for first GSC sync…
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Stat
                  label="Clicks"
                  value={formatCompact(metrics.current.clicks)}
                  delta={formatDeltaPercent(metrics.deltas.clicks)}
                  positive={metrics.deltas.clicks >= 0}
                />
                <Stat
                  label="Impressions"
                  value={formatCompact(metrics.current.impressions)}
                  delta={formatDeltaPercent(metrics.deltas.impressions)}
                  positive={metrics.deltas.impressions >= 0}
                />
                <Stat
                  label="Avg pos"
                  value={
                    metrics.current.avgPosition > 0
                      ? metrics.current.avgPosition.toFixed(1)
                      : "—"
                  }
                  delta={
                    metrics.deltas.avgPosition === 0
                      ? "0"
                      : `${metrics.deltas.avgPosition > 0 ? "+" : ""}${metrics.deltas.avgPosition.toFixed(1)}`
                  }
                  positive={metrics.deltas.avgPosition >= 0}
                />
                <Stat
                  label="Keywords"
                  value={metrics.current.uniqueKeywords.toLocaleString()}
                />
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  delta,
  positive,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-panel/80 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="font-data text-base font-semibold text-foreground">{value}</p>
        {delta !== undefined && (
          <span
            className={cn(
              "font-data text-[11px] font-medium",
              positive ? "text-signal" : "text-danger"
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
