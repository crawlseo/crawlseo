import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DeleteSiteButton } from "@/components/sites/delete-site-button";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { BingSiteSection } from "@/components/settings/bing-site-section";
import { LanguageSection } from "@/components/settings/language-section";
import { getT } from "@/lib/i18n/server";

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

  // Check API key status
  const apiKeys = await db.apiKey.findMany({
    where: { userId: session.user.id },
    select: { provider: true, updatedAt: true },
  });
  const apiKeyStatus: Record<string, { connected: boolean; updatedAt?: string }> = {
    dataforseo: { connected: false },
    google_pagespeed: { connected: false },
    bing: { connected: false },
  };
  for (const key of apiKeys) {
    apiKeyStatus[key.provider] = {
      connected: true,
      updatedAt: key.updatedAt.toISOString(),
    };
  }

  return (
    <div>
      <PageHeader
        title={t("Settings")}
        description={t("Site configuration and data management.")}
      />

      <div className="space-y-6">
        <LanguageSection />
        {/* Site info */}
        <div className="panel p-5">
          <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
            {t("Site details")}{" "}
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Domain")}</dt>
              <dd className="font-medium text-text-strong">{site.domain}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("GSC property")}</dt>
              <dd className="font-medium text-text-strong">
                {site.gscProperty || "Not connected"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Bing property")}</dt>
              <dd className="font-medium text-text-strong">{site.bingSite || "Not connected"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Added")}</dt>
              <dd className="font-medium text-text-strong">
                {t.date(site.createdAt, { year: true })}
              </dd>
            </div>
          </dl>
        </div>

        {/* External API keys */}
        <ApiKeysSection initialStatus={apiKeyStatus} />

        {/* Bing Webmaster property */}
        <BingSiteSection
          siteId={siteId}
          bingSite={site.bingSite}
          keyConnected={apiKeyStatus.bing.connected}
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
