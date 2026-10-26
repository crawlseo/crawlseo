import type { PrismaClient } from "@prisma/client";
import { ALERT_EMAIL_JOB } from "@/lib/jobs/handlers";
import { getAlertEmail } from "@/lib/user-settings";
import { emailsEnabled, smtpConfig } from "./config";

/** The latest alert email as Settings shows it. */
export type LastEmail = {
  status: "queued" | "running" | "sent" | "retrying" | "failed";
  /** When it was sent or failed, or queued while it waits. */
  at: string;
  attempts: number;
  /** Already without the SMTP login (lib/email/send.ts). */
  error: string | null;
  nextAttemptAt: string | null;
};

/**
 * Settings > Email alerts: the body of GET /api/user/email. Says whether SMTP
 * is set up, never how: no host, login or sender comes back.
 */
export type EmailStatus = {
  /** ALERT_EMAILS_ENABLED is not false. */
  enabled: boolean;
  /** SMTP_HOST and SMTP_FROM are set. */
  configured: boolean;
  recipients: string[];
  /** The user's switch: fired alerts are emailed. */
  on: boolean;
  lastEmail: LastEmail | null;
};

export async function emailStatus(db: PrismaClient, userId: string): Promise<EmailStatus> {
  const [settings, job] = await Promise.all([
    getAlertEmail(db, userId),
    db.job.findFirst({
      where: { type: ALERT_EMAIL_JOB, site: { userId } },
      orderBy: { createdAt: "desc" },
      select: { status: true, attempts: true, runAt: true, createdAt: true, finishedAt: true, lastError: true },
    }),
  ]);
  let lastEmail: LastEmail | null = null;
  if (job) {
    const retrying = job.status === "QUEUED" && job.attempts > 0;
    lastEmail = {
      status:
        job.status === "SUCCEEDED" ? "sent"
        : job.status === "FAILED" ? "failed"
        : job.status === "RUNNING" ? "running"
        : retrying ? "retrying"
        : "queued",
      at: (job.finishedAt ?? job.createdAt).toISOString(),
      attempts: job.attempts,
      error: job.status === "SUCCEEDED" ? null : job.lastError,
      nextAttemptAt: retrying ? job.runAt.toISOString() : null,
    };
  }
  return {
    enabled: emailsEnabled(),
    configured: smtpConfig() !== null,
    recipients: settings.recipients,
    on: settings.enabled,
    lastEmail,
  };
}
