import type { Job, PrismaClient } from "@prisma/client";
import type { AlertFire } from "@/lib/alerts/evaluate";
import { ALERT_WEBHOOK_JOB, hasAlertWebhook } from "@/lib/jobs/handlers";
import { enqueueJob, MANUAL_PRIORITY } from "@/lib/jobs/queue";
import type { JobSource } from "@/lib/jobs/types";

/**
 * Queues one webhook delivery per site for alerts that fired outside a job
 * (Evaluate now). Nothing when the user has no webhook. The caller dispatches
 * the returned jobs.
 */
export async function queueAlertWebhooks(
  db: PrismaClient,
  userId: string,
  fires: AlertFire[],
  opts: { source: JobSource; firedAt?: Date }
): Promise<Job[]> {
  if (fires.length === 0 || !(await hasAlertWebhook(db, userId))) return [];
  const firedAt = (opts.firedAt ?? new Date()).toISOString();
  const bySite = new Map<string, AlertFire[]>();
  for (const fire of fires) bySite.set(fire.siteId, [...(bySite.get(fire.siteId) ?? []), fire]);
  const jobs: Job[] = [];
  for (const [siteId, siteFires] of bySite) {
    const { job } = await enqueueJob(db, {
      type: ALERT_WEBHOOK_JOB,
      siteId,
      source: opts.source,
      payload: { fires: siteFires, firedAt },
      priority: MANUAL_PRIORITY,
      unique: false,
    });
    jobs.push(job);
  }
  return jobs;
}
