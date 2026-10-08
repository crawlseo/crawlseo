import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSitePeriodMetrics, formatCompact } from "@/lib/seo-metrics";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSiteModal } from "@/components/sites/add-site-modal";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { formatDeltaPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export default async function DashboardPage() {
  const t = await getT();
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
  const hasData = (s: (typeof sites)[number]) => s._count.keywords > 0 || s._count.pages > 0;

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
          title={t("Welcome to crawlseo")}
          description={t(
            "Connect Google Search Console properties to track rankings, traffic, and opportunity.",
          )}
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
          title={t("No sites connected")}
          description={t(
            "Import a GSC property to start monitoring organic search performance. Read-only access only.",
          )}
          actionLabel={t("Add site")}
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
    }),
  );

  return (
    <div>
      <PageHeader
        title={t("Portfolio overview")}
        description={t("{0} · last 28 days vs prior period", {
          "0": t("counts.sites", { count: sites.length }),
        })}
        actions={
          <div className="flex items-center gap-3">
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
            className="panel group relative block overflow-hidden p-5 transition-colors hover:border-line-strong"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-data text-[17px] leading-6 font-medium text-text-strong">
                  {site.domain}
                </h2>
                <p className="mt-0.5 truncate font-data text-[12px] text-muted-foreground">
                  {site.gscProperty}
                </p>
              </div>
              <span
                aria-hidden
                className="text-muted-foreground transition-colors group-hover:text-text-strong"
              >
                →
              </span>
            </div>

            {!metrics ? (
              <div className="mt-6 rounded-md border border-dashed border-line-strong px-3 py-4 text-sm text-muted-foreground">
                {t("Waiting for first GSC sync…")}{" "}
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Stat
                  label={t("Clicks")}
                  value={formatCompact(metrics.current.clicks, t.intlLocale)}
                  delta={formatDeltaPercent(metrics.deltas.clicks, t.intlLocale)}
                  positive={metrics.deltas.clicks >= 0}
                />
                <Stat
                  label={t("Impressions")}
                  value={formatCompact(metrics.current.impressions, t.intlLocale)}
                  delta={formatDeltaPercent(metrics.deltas.impressions, t.intlLocale)}
                  positive={metrics.deltas.impressions >= 0}
                />
                <Stat
                  label={t("Avg position")}
                  value={
                    metrics.current.avgPosition > 0
                      ? t.number(metrics.current.avgPosition, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                          useGrouping: false,
                        })
                      : t("n/a")
                  }
                  delta={
                    metrics.deltas.avgPosition === 0
                      ? "0"
                      : `${metrics.deltas.avgPosition > 0 ? "+" : ""}${t.number(metrics.deltas.avgPosition, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })}`
                  }
                  positive={metrics.deltas.avgPosition >= 0}
                />
                <Stat
                  label={t("Keywords")}
                  value={metrics.current.uniqueKeywords.toLocaleString(t.intlLocale)}
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
    <div className="rounded-md border border-border-soft bg-bg-soft px-3 py-2.5">
      <p className="mono-label text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="font-data text-[16px] font-medium text-text-strong">{value}</p>
        {delta !== undefined && (
          <span className={cn("font-data text-[12px]", positive ? "text-success" : "text-danger")}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
