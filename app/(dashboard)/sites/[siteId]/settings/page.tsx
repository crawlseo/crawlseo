import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DeleteSiteButton } from "@/components/sites/delete-site-button";
import { BingSiteSection } from "@/components/settings/bing-site-section";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function SettingsPage({ params }: Props) {
  const t = await getT();
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      userId: true,
      domain: true,
      gscProperty: true,
      bingSite: true,
      createdAt: true,
      _count: {
        select: {
          keywords: true,
          pages: true,
          crawls: true,
          vitals: true,
          alerts: true,
          savedKeywords: true,
        },
      },
    },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");

  const bingKey = await db.apiKey.findFirst({
    where: { userId: session.user.id, provider: "bing" },
    select: { id: true },
  });

  return (
    <div>
      <PageHeader
        title={t("Site settings")}
        meta={site.domain}
        description={t("Site configuration and data management.")}
      />

      <div className="space-y-6">
        <div id="api-keys" className="panel-muted scroll-mt-6 p-4 text-sm text-muted-foreground">
          {t("Language, appearance and API keys are managed in global settings.")}{" "}
          <Link href="/settings" className="text-link">{t("Open global settings")}</Link>
        </div>
        {/* Site info */}
        <div className="panel p-5">
          <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
            {t("Site details")}{" "}
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
              <dt className="text-muted-foreground">{t("Domain")}</dt>
              <dd className="min-w-0 break-all font-medium text-text-strong">{site.domain}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
              <dt className="text-muted-foreground">{t("GSC property")}</dt>
              <dd className="min-w-0 break-all font-medium text-text-strong">
                {site.gscProperty || t("Not connected")}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
              <dt className="text-muted-foreground">{t("Bing property")}</dt>
              <dd className="min-w-0 break-all font-medium text-text-strong">{site.bingSite || t("Not connected")}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
              <dt className="text-muted-foreground">{t("Added")}</dt>
              <dd className="min-w-0 break-all font-medium text-text-strong">
                {t.date(site.createdAt, { year: true })}
              </dd>
            </div>
          </dl>
        </div>

        {/* Bing Webmaster property */}
        <BingSiteSection
          siteId={siteId}
          bingSite={site.bingSite}
          keyConnected={!!bingKey}
        />

        {/* Data summary */}
        <div className="panel p-5">
          <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
            {t("Stored data")}{" "}
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DataStat label={t("Keyword records")} value={site._count.keywords} />
            <DataStat label={t("Page records")} value={site._count.pages} />
            <DataStat label={t("Crawls")} value={site._count.crawls} />
            <DataStat label={t("Vitals reports")} value={site._count.vitals} />
            <DataStat label={t("Alert rules")} value={site._count.alerts} />
            <DataStat label={t("Saved keywords")} value={site._count.savedKeywords} />
          </div>
        </div>

        {/* Danger zone */}
        <div className="panel border-danger/30 p-5">
          <h3 className="text-[15px] leading-5 font-semibold text-danger">{t("Danger zone")} </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Permanently delete this site and all associated data. This action cannot be undone.",
            )}{" "}
          </p>
          <div className="mt-4">
            <DeleteSiteButton siteId={siteId} domain={site.domain} />
          </div>
        </div>
      </div>
    </div>
  );
}

async function DataStat({ label, value }: { label: string; value: number }) {
  const t = await getT();
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
      <p className="mono-label text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-data text-lg font-medium text-text-strong">
        {t.number(value)}
      </p>
    </div>
  );
}
