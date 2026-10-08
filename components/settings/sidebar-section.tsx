"use client";

import { useT } from "@/components/i18n/provider";
import {
  CLOUD_PROMO_HIDDEN,
  SIDEBAR_COLLAPSED,
  setPreference,
  useBrowserPreference,
} from "@/lib/browser-preferences";

export function SidebarSection({
  cloudPromoAllowed,
}: {
  cloudPromoAllowed: boolean;
}) {
  const t = useT();
  const hidden = useBrowserPreference(CLOUD_PROMO_HIDDEN);
  const collapsed = useBrowserPreference(SIDEBAR_COLLAPSED);
  return (
    <section className="panel p-5" aria-labelledby="sidebar-title">
      <h2 id="sidebar-title" className="text-[15px] font-semibold">
        {t("Sidebar")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Customize navigation for this browser.")}
      </p>
      <div className="mt-4 space-y-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={collapsed}
            onChange={(event) =>
              setPreference(SIDEBAR_COLLAPSED, event.target.checked)
            }
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-text-strong">
              {t("Compact sidebar")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t("Show navigation icons on larger screens.")}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={cloudPromoAllowed && !hidden}
            disabled={!cloudPromoAllowed}
            onChange={(event) =>
              setPreference(CLOUD_PROMO_HIDDEN, !event.target.checked)
            }
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-text-strong">
              {t("Show cloud card")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                cloudPromoAllowed
                  ? "Show the crawlseo.cloud link in the sidebar."
                  : "The cloud card is disabled for this installation.",
              )}
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
