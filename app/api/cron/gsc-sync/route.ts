import { db } from "@/lib/db";
import { syncGSCDataForSite } from "@/lib/workers/gsc-sync";
import { syncGBPDataForSite } from "@/lib/workers/gbp-sync";

export const maxDuration = 300;

/**
 * Scheduled GSC + GBP sync. Invoked by Vercel Cron (see vercel.json) every 6
 * hours. Refreshes the last 28 days of GSC keyword + page data for every site
 * with a connected GSC property, and the rolling Business Profile daily metrics
 * for every site with a linked GBP location.
 *
 * Protected by CRON_SECRET: Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when the env var is set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [gscSites, gbpSites] = await Promise.all([
    db.site.findMany({
      where: { gscProperty: { not: null } },
      select: { id: true, userId: true },
    }),
    db.site.findMany({
      where: { gbpLocation: { not: null } },
      select: { id: true, userId: true },
    }),
  ]);

  let gscSynced = 0;
  let gscFailed = 0;
  let gbpSynced = 0;
  let gbpFailed = 0;

  // Sequential to avoid hammering the Google APIs and token-refresh contention.
  for (const site of gscSites) {
    const result = await syncGSCDataForSite(site.userId, site.id);
    if (result.success) gscSynced++;
    else gscFailed++;
  }

  for (const site of gbpSites) {
    const result = await syncGBPDataForSite(site.userId, site.id);
    if (result.success) gbpSynced++;
    else gbpFailed++;
  }

  return Response.json({
    ok: true,
    gsc: { total: gscSites.length, synced: gscSynced, failed: gscFailed },
    gbp: { total: gbpSites.length, synced: gbpSynced, failed: gbpFailed },
  });
}
