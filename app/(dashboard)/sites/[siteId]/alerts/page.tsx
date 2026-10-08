import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ensureDefaultAlerts } from "@/lib/alerts/evaluate";
import { PageHeader } from "@/components/ui/page-header";
import { EvaluateAlertsButton } from "@/components/sites/evaluate-alerts-button";
import { getT } from "@/lib/i18n/server";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function AlertsPage({ params }: Props) {
  const t = await getT();
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");

  await ensureDefaultAlerts(session!.user!.id, siteId);

  const alerts = await db.alert.findMany({
    where: { userId: session!.user!.id, siteId },
    orderBy: { type: "asc" },
  });

  return (
    <div>
      <PageHeader
        title={t("Alerts")}
        description={t(
          "Rules for traffic drops, position changes, crawl health and vitals.",
        )}
        actions={<EvaluateAlertsButton />}
      />

      <div className="panel divide-y divide-border-soft">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="mono-label text-[12px] text-text-strong">
                {t(a.type.replaceAll("_", " "))}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Channel:")} {t(a.channel)}
                {a.lastFired
                  ? t(" · last fired {0}", {
                      "0": t.date(a.lastFired, { year: true, time: true }),
                    })
                  : ` ${t("· never fired")}`}
              </p>
              <p className="mt-1 font-data text-[11px] text-muted-foreground">
                {JSON.stringify(a.config)}
              </p>
            </div>
            <span
              className={
                a.enabled
                  ? "mono-label rounded-md border border-success/30 bg-success-bg px-2 py-0.5 text-[11px] text-success"
                  : "mono-label rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
              }
            >
              {a.enabled ? t("Enabled") : t("Off")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
