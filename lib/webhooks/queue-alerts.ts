import type { Job, PrismaClient } from "@prisma/client";
import type { AlertFire } from "@/lib/alerts/evaluate";
import { ALERT_EMAIL_JOB, ALERT_WEBHOOK_JOB, hasAlertEmail, hasAlertWebhook } from "@/lib/jobs/handlers";
import { enqueueJob, MANUAL_PRIORITY } from "@/lib/jobs/queue";
import type { JobSource } from "@/lib/jobs/types";
import { firesToDeliver } from "./deliver";

/**
 * Queues one webhook delivery and one email per site for alerts that fired
 * outside a job (Evaluate now), leaving out those already sent within the
 * last day (firesToDeliver). Nothing for a channel the user has not set up.
 * The caller dispatches the returned jobs.
 */
export async function queueAlertDeliveries(
  db: PrismaClient,
  userId: string,
  fires: AlertFire[],
  opts: { source: JobSource; firedAt?: Date }
): Promise<Job[]> {
  const now = opts.firedAt ?? new Date();
  const due = firesToDeliver(fires, now);
  if (due.length === 0) return [];
  const [webhook, email] = await Promise.all([hasAlertWebhook(db, userId), hasAlertEmail(db, userId)]);
  const types = [...(webhook ? [ALERT_WEBHOOK_JOB] : []), ...(email ? [ALERT_EMAIL_JOB] : [])];
  if (types.length === 0) return [];
  const firedAt = now.toISOString();
  const bySite = new Map<string, AlertFire[]>();
  for (const fire of due) bySite.set(fire.siteId, [...(bySite.get(fire.siteId) ?? []), fire]);
  const jobs: Job[] = [];
  for (const [siteId, siteFires] of bySite) {
    for (const type of types) {
      const { job } = await enqueueJob(db, {
        type,
        siteId,
        source: opts.source,
        payload: { fires: siteFires, firedAt },
        priority: MANUAL_PRIORITY,
        unique: false,
      });
      jobs.push(job);
    }
  }
  return jobs;
}
