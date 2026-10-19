import type { PrismaClient } from "@prisma/client";
import { isServerless } from "@/lib/jobs/config";
import { ALERT_WEBHOOK_JOB } from "@/lib/jobs/handlers";
import { getWebhook } from "@/lib/user-settings";
import { allowPrivateWebhooks, webhooksEnabled } from "./config";

/** The latest delivery as Settings shows it. */
export type LastDelivery = {
  status: "queued" | "running" | "delivered" | "retrying" | "failed";
  /** When it was delivered or failed, or queued while it waits. */
  at: string;
  attempts: number;
  httpStatus: number | null;
  error: string | null;
  nextAttemptAt: string | null;
};

/** Settings > Alert webhook: the body of GET /api/user/webhook. */
export type WebhookStatus = {
  /** ALERT_WEBHOOKS_ENABLED is not false. */
  enabled: boolean;
  allowPrivate: boolean;
  /** A serverless host retries within the request, then at the next cron run, not on the queue's backoff. */
  serverless: boolean;
  /** The saved URL, null when none is set. The secret is never sent back. */
  url: string | null;
  lastDelivery: LastDelivery | null;
};

export async function webhookStatus(db: PrismaClient, userId: string): Promise<WebhookStatus> {
  const [webhook, job] = await Promise.all([
    getWebhook(db, userId),
    db.job.findFirst({
      where: { type: ALERT_WEBHOOK_JOB, site: { userId } },
      orderBy: { createdAt: "desc" },
      select: { status: true, attempts: true, runAt: true, createdAt: true, finishedAt: true, lastError: true, errorCode: true, result: true },
    }),
  ]);
  let lastDelivery: LastDelivery | null = null;
  if (job) {
    const fromCode = job.errorCode?.startsWith("HTTP_") ? Number(job.errorCode.slice(5)) : null;
    const fromResult = (job.result as { status?: unknown } | null)?.status;
    const retrying = job.status === "QUEUED" && job.attempts > 0;
    lastDelivery = {
      status:
        job.status === "SUCCEEDED" ? "delivered"
        : job.status === "FAILED" ? "failed"
        : job.status === "RUNNING" ? "running"
        : retrying ? "retrying"
        : "queued",
      at: (job.finishedAt ?? job.createdAt).toISOString(),
      attempts: job.attempts,
      httpStatus: typeof fromResult === "number" ? fromResult : fromCode,
      error: job.status === "SUCCEEDED" ? null : job.lastError,
      nextAttemptAt: retrying ? job.runAt.toISOString() : null,
    };
  }
  return {
    enabled: webhooksEnabled(),
    allowPrivate: allowPrivateWebhooks(),
    serverless: isServerless(),
    url: webhook?.url ?? null,
    lastDelivery,
  };
}
