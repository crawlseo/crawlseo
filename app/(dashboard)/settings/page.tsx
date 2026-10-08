import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { LanguageSection } from "@/components/settings/language-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { SidebarSection } from "@/components/settings/sidebar-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { getT } from "@/lib/i18n/server";
import { getTheme } from "@/lib/appearance-server";

export default async function GlobalSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [t, theme, apiKeys] = await Promise.all([
    getT(),
    getTheme(),
    db.apiKey.findMany({
      where: { userId: session.user.id },
      select: { provider: true, updatedAt: true },
    }),
  ]);
  const status: Record<string, { connected: boolean; updatedAt?: string }> = {
    dataforseo: { connected: false },
    google_pagespeed: { connected: false },
    bing: { connected: false },
  };
  for (const key of apiKeys)
    status[key.provider] = {
      connected: true,
      updatedAt: key.updatedAt.toISOString(),
    };

  return (
    <div>
      <PageHeader
        title={t("Global settings")}
        description={t(
          "Manage language, appearance and integrations for all your sites.",
        )}
      />
      <div className="space-y-6">
        <nav
          aria-label={t("Settings sections")}
          className="flex flex-wrap gap-x-5 gap-y-2 text-sm"
        >
          <a className="text-link" href="#appearance">
            {t("Appearance")}
          </a>
          <a className="text-link" href="#language">
            {t("Language")}
          </a>
          <a className="text-link" href="#api-keys">
            {t("External API keys")}
          </a>
        </nav>
        <AppearanceSection initialTheme={theme} />
        <LanguageSection />
        <SidebarSection
          cloudPromoAllowed={
            process.env.CRAWLSEO_HIDE_CLOUD_PROMO?.trim().toLowerCase() !==
            "true"
          }
        />
        <ApiKeysSection initialStatus={status} />
        <section className="panel p-5" aria-labelledby="account-title">
          <h2 id="account-title" className="text-[15px] font-semibold">
            {t("Account")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Signed in as")}
          </p>
          <p className="mt-2 break-words font-medium text-text-strong">
            {session.user.name || session.user.email}
          </p>
          {session.user.name && (
            <p className="break-words text-sm text-muted-foreground">
              {session.user.email}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
