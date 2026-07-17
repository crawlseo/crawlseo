import { db } from "@/lib/db";
import { getSitePeriodMetrics } from "@/lib/seo-metrics";
import { getContentDecay } from "@/lib/seo-opportunities";

export type AlertFire = {
  alertId: string;
  type: string;
  message: string;
  siteId: string;
  domain: string;
};

/**
 * Evaluate enabled alerts for a user. Lightweight rules for v1.
 */
export async function evaluateAlertsForUser(userId: string): Promise<AlertFire[]> {
  const alerts = await db.alert.findMany({
    where: { userId, enabled: true },
    include: { site: { select: { id: true, domain: true } } },
  });

  const fires: AlertFire[] = [];

  for (const alert of alerts) {
    const config = (alert.config || {}) as {
      thresholdPct?: number;
      thresholdPositions?: number;
    };

    try {
      if (alert.type === "TRAFFIC_DROP") {
        const { deltas, current } = await getSitePeriodMetrics(alert.siteId, 7);
        const threshold = config.thresholdPct ?? -20;
        if (deltas.clicks <= threshold && current.clicks >= 5) {
          fires.push({
            alertId: alert.id,
            type: alert.type,
            siteId: alert.siteId,
            domain: alert.site.domain,
            message: `Traffic drop on ${alert.site.domain}: clicks ${deltas.clicks.toFixed(1)}% vs prior week`,
          });
        }
      }

      if (alert.type === "POSITION_CHANGE") {
        const { deltas } = await getSitePeriodMetrics(alert.siteId, 28);
        // avgPosition delta: positive = improved; fire when worsened (negative)
        const threshold = config.thresholdPositions ?? -2;
        if (deltas.avgPosition <= threshold) {
          fires.push({
            alertId: alert.id,
            type: alert.type,
            siteId: alert.siteId,
            domain: alert.site.domain,
            message: `Avg position worsened by ${Math.abs(deltas.avgPosition).toFixed(1)} on ${alert.site.domain}`,
          });
        }
      }

      if (alert.type === "CRAWL_ISSUES") {
        const latest = await db.crawl.findFirst({
          where: { siteId: alert.siteId, status: "COMPLETED" },
          orderBy: { finishedAt: "desc" },
        });
        if (latest && (latest.healthScore ?? 100) < 70) {
          fires.push({
            alertId: alert.id,
            type: alert.type,
            siteId: alert.siteId,
            domain: alert.site.domain,
            message: `Crawl health ${latest.healthScore}/100 on ${alert.site.domain} (${latest.issuesFound} issues)`,
          });
        }
      }

      if (alert.type === "VITALS_DEGRADED") {
        const recent = await db.vitalsReport.findMany({
          where: { siteId: alert.siteId },
          orderBy: { date: "desc" },
          take: 5,
        });
        const bad = recent.filter(
          (v) => (v.lcp && v.lcp > 2.5) || (v.cls && v.cls > 0.1) || (v.perfScore && v.perfScore < 50)
        );
        if (bad.length >= 2) {
          fires.push({
            alertId: alert.id,
            type: alert.type,
            siteId: alert.siteId,
            domain: alert.site.domain,
            message: `Core Web Vitals degraded on ${alert.site.domain} (${bad.length} recent poor reports)`,
          });
        }
      }

      // Bonus: content decay as traffic signal
      if (alert.type === "TRAFFIC_DROP") {
        const decay = await getContentDecay(alert.siteId, 3);
        if (decay[0] && decay[0].changePct < -40) {
          // already may have fired; skip duplicate style
        }
      }
    } catch (err) {
      console.error(`Alert ${alert.id} failed:`, err);
    }
  }

  // Mark fired
  const now = new Date();
  for (const fire of fires) {
    await db.alert.update({
      where: { id: fire.alertId },
      data: { lastFired: now },
    });
  }

  return fires;
}

export async function ensureDefaultAlerts(userId: string, siteId: string) {
  const existing = await db.alert.count({ where: { userId, siteId } });
  if (existing > 0) return;

  await db.alert.createMany({
    data: [
      {
        userId,
        siteId,
        type: "TRAFFIC_DROP",
        channel: "EMAIL",
        config: { thresholdPct: -20 },
      },
      {
        userId,
        siteId,
        type: "POSITION_CHANGE",
        channel: "EMAIL",
        config: { thresholdPositions: -2 },
      },
      {
        userId,
        siteId,
        type: "CRAWL_ISSUES",
        channel: "EMAIL",
        config: {},
      },
      {
        userId,
        siteId,
        type: "VITALS_DEGRADED",
        channel: "EMAIL",
        config: {},
      },
    ],
  });
}
