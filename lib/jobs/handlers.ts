import type { Job, PrismaClient } from "@prisma/client";
import { runSiteCrawl } from "@/lib/crawler/engine";
import { ACTIVE_CRAWL_STATUSES, INTERRUPTED_MESSAGE, trackRunningCrawl } from "@/lib/crawler/lifecycle";
import { evaluateAlertsForUser } from "@/lib/alerts/evaluate";
import { BingKeyMissingError } from "@/lib/bing/bing-client";
import { ReauthRequiredError } from "@/lib/google";
import { runGSCSync } from "@/lib/workers/gsc-sync";
import { syncBingDataForSite } from "@/lib/workers/bing-sync";
import { syncVitalsForSite } from "@/lib/workers/vitals-sync";
import { getWebhook } from "@/lib/user-settings";
import { webhooksEnabled } from "@/lib/webhooks/config";
import { alertPayload, sendWebhook, type AlertDelivery } from "@/lib/webhooks/deliver";
import { clampMaxPages } from "./policy";
import { isPermanentJobError, JobError, JobLostError, type JobClass, type JobHandler } from "./types";

/*
 * The job types this app knows. A handler declares its type, its class (LONG
 * or SHORT), how many attempts it gets and which errors are permanent; the
 * claim loop, the scheduler and the retry logic read all of that from here.
 * Job.type is a plain string, so registering another type needs no schema
 * change: call registerJobHandler before the queue runs.
 */

/** On globalThis like the Prisma client in lib/db.ts: a route handler and a server action may load separate copies of this module. */
const registryHolder = globalThis as unknown as { crawlseoJobHandlers?: Map<string, JobHandler> };
const registry = (registryHolder.crawlseoJobHandlers ??= new Map<string, JobHandler>());

/** Adds a job type, or replaces the handler of one already registered. */
export function registerJobHandler(handler: JobHandler): void {
  if (!handler.type.trim()) throw new Error("A job handler needs a type");
  if (!Number.isInteger(handler.maxAttempts) || handler.maxAttempts < 1) {
    throw new Error(`Job handler ${handler.type}: maxAttempts must be a whole number of at least 1`);
  }
  registry.set(handler.type, handler);
}

export function getJobHandler(type: string): JobHandler | undefined {
  return registry.get(type);
}

/** The registered types, or those of one class. */
export function jobTypes(cls?: JobClass): string[] {
  return [...registry.values()].filter((h) => !cls || h.class === cls).map((h) => h.type);
}

/* ------------------------------------------------------------------ */
/*  Built-in job types                                                */
/* ------------------------------------------------------------------ */

export const CRAWL_JOB = "crawl";
export const VITALS_JOB = "vitals";
export const GSC_SYNC_JOB = "gsc-sync";
export const BING_SYNC_JOB = "bing-sync";
export const ALERTS_EVALUATE_JOB = "alerts-evaluate";
export const ALERT_WEBHOOK_JOB = "alert-webhook";

/** The job's site, or a permanent failure when it is gone. */
async function siteOf(db: PrismaClient, job: Job) {
  const site = await db.site.findUnique({
    where: { id: job.siteId },
    select: { id: true, userId: true, domain: true, gscProperty: true, bingSite: true },
  });
  if (!site) throw new JobError("Site not found", { code: "SITE_NOT_FOUND", permanent: true });
  return site;
}

/**
 * A crawl attempt creates its own Crawl row and links it to the job in one
 * transaction, only while this process still holds the job.
 */
async function startCrawlRow(db: PrismaClient, job: Job, workerId: string, siteId: string, maxPages: number) {
  return db.$transaction(async (tx) => {
    const held = await tx.job.count({ where: { id: job.id, lockedBy: workerId, status: "RUNNING" } });
    if (!held) throw new JobLostError();
    const crawl = await tx.crawl.create({
      data: { siteId, status: "PENDING", lastProgressAt: new Date(), maxPages },
      select: { id: true },
    });
    await tx.job.update({ where: { id: job.id }, data: { crawlId: crawl.id } });
    return crawl;
  });
}

const crawlHandler: JobHandler = {
  type: CRAWL_JOB,
  class: "LONG",
  // The second attempt is only for a crawl that was interrupted (its process
  // died or shut down). A crawl that ran and failed has its reason on the
  // crawl row; the next scheduled crawl is the retry.
  maxAttempts: 2,
  isPermanent: () => true,
  stopOnShutdown: true,
  async run({ db, job, workerId, signal, deadline }) {
    const site = await siteOf(db, job);
    const maxPages = clampMaxPages((job.payload as { maxPages?: unknown } | null)?.maxPages);
    const crawl = await startCrawlRow(db, job, workerId, site.id, maxPages);

    // stopCrawls (account deletion) reaches the crawl through its own controller.
    const local = new AbortController();
    const untrack = trackRunningCrawl(crawl.id, local);
    try {
      const result = await runSiteCrawl(
        site.id,
        site.domain,
        maxPages,
        crawl.id,
        AbortSignal.any([signal, local.signal]),
        { deadline }
      );
      return {
        crawlId: crawl.id,
        pagesFound: result.pagesFound,
        issuesFound: result.issuesFound,
        healthScore: result.healthScore,
      };
    } finally {
      untrack();
    }
  },
  async onInterrupted(db, job) {
    if (!job.crawlId) return;
    await db.crawl.updateMany({
      where: { id: job.crawlId, status: { in: ACTIVE_CRAWL_STATUSES } },
      data: { status: "FAILED", finishedAt: new Date(), error: INTERRUPTED_MESSAGE },
    });
  },
};

const vitalsHandler: JobHandler = {
  type: VITALS_JOB,
  class: "LONG",
  maxAttempts: 2,
  isPermanent: isPermanentJobError,
  async run({ db, job }) {
    const site = await siteOf(db, job);
    const result = await syncVitalsForSite(site.userId, site.id, 5);
    if (result.error) {
      // An exhausted quota stays exhausted for the day: no retry.
      throw new JobError(result.error, {
        code: result.errorCode,
        permanent: result.errorCode === "QUOTA_EXCEEDED",
      });
    }
    return { inserted: result.inserted, results: result.results };
  },
};

const gscSyncHandler: JobHandler = {
  type: GSC_SYNC_JOB,
  class: "SHORT",
  maxAttempts: 3,
  isPermanent: isPermanentJobError,
  followUps: () => [ALERTS_EVALUATE_JOB],
  async run({ db, job }) {
    const site = await siteOf(db, job);
    if (!site.gscProperty) {
      throw new JobError("Site does not have GSC property connected", { code: "NOT_CONNECTED", permanent: true });
    }
    try {
      const result = await runGSCSync(site.userId, site.id, site.gscProperty);
      return {
        keywordsInserted: result.keywordsInserted,
        pagesInserted: result.pagesInserted,
        startDate: result.startDate,
        endDate: result.endDate,
      };
    } catch (err) {
      if (err instanceof ReauthRequiredError) {
        throw new JobError(err.message, { code: "REAUTH_REQUIRED", permanent: true });
      }
      throw err;
    }
  },
};

const bingSyncHandler: JobHandler = {
  type: BING_SYNC_JOB,
  class: "SHORT",
  maxAttempts: 3,
  isPermanent: isPermanentJobError,
  followUps: () => [ALERTS_EVALUATE_JOB],
  async run({ db, job }) {
    const site = await siteOf(db, job);
    if (!site.bingSite) {
      throw new JobError("Site does not have a Bing Webmaster property connected", {
        code: "NOT_CONNECTED",
        permanent: true,
      });
    }
    const hasKey = await db.apiKey.count({ where: { userId: site.userId, provider: "bing" } });
    if (!hasKey) {
      throw new JobError(new BingKeyMissingError().message, { code: "KEY_MISSING", permanent: true });
    }
    const result = await syncBingDataForSite(site.userId, site.id);
    if (!result.success) throw new JobError(result.error ?? "Bing sync failed");
    return {
      success: true,
      daysUpserted: result.daysUpserted,
      queriesUpserted: result.queriesUpserted,
      pagesUpserted: result.pagesUpserted,
      ...(result.partial && { partial: result.partial }),
    };
  },
};

/** Whether the user's alerts go to a webhook: webhooks on for this server and a webhook set in Settings. */
export async function hasAlertWebhook(db: PrismaClient, userId: string): Promise<boolean> {
  return webhooksEnabled() && (await getWebhook(db, userId)) !== null;
}

const alertsEvaluateHandler: JobHandler = {
  type: ALERTS_EVALUATE_JOB,
  class: "SHORT",
  maxAttempts: 3,
  isPermanent: isPermanentJobError,
  // The alerts that fired go to the user's webhook as one delivery, a job of its own.
  followUps: (_job, result) => {
    const r = result as { fires?: AlertDelivery["fires"]; firedAt?: string; webhook?: boolean } | undefined;
    if (!r?.webhook || !r.fires?.length || !r.firedAt) return [];
    return [{ type: ALERT_WEBHOOK_JOB, payload: { fires: r.fires, firedAt: r.firedAt }, unique: false }];
  },
  async run({ db, job }) {
    const site = await siteOf(db, job);
    const fires = await evaluateAlertsForUser(site.userId, { siteId: site.id });
    const webhook = fires.length > 0 && (await hasAlertWebhook(db, site.userId));
    return { fired: fires.length, fires, firedAt: new Date().toISOString(), webhook };
  },
};

/**
 * One webhook delivery: the alerts of one evaluation of one site. A failure a
 * retry can fix (network error, timeout, HTTP 408, 425, 429 or 5xx) is retried
 * with the queue's backoff, 1, 5, 25 and 60 minutes; any other answer fails
 * the delivery at once. The URL and secret are read on every attempt, so a
 * fixed URL applies to deliveries still waiting.
 */
const alertWebhookHandler: JobHandler = {
  type: ALERT_WEBHOOK_JOB,
  class: "SHORT",
  maxAttempts: 5,
  isPermanent: isPermanentJobError,
  async run({ db, job }) {
    const site = await siteOf(db, job);
    if (!webhooksEnabled()) {
      throw new JobError("Alert webhooks are turned off on this server", { code: "WEBHOOKS_OFF", permanent: true });
    }
    const webhook = await getWebhook(db, site.userId);
    if (!webhook) throw new JobError("No webhook is set in Settings", { code: "NOT_CONFIGURED", permanent: true });
    const delivery = job.payload as AlertDelivery | null;
    if (!Array.isArray(delivery?.fires) || delivery.fires.length === 0) {
      throw new JobError("The delivery has no alerts", { code: "EMPTY", permanent: true });
    }
    const result = await sendWebhook(webhook.url, webhook.secret, "alert.fired", alertPayload(job.id, delivery));
    if (!result.ok) {
      throw new JobError(result.error, {
        code: result.status ? `HTTP_${result.status}` : "UNREACHABLE",
        permanent: !result.retryable,
      });
    }
    return { status: result.status, alerts: delivery.fires.length };
  },
};

export const BUILT_IN_JOB_HANDLERS: readonly JobHandler[] = [
  crawlHandler,
  vitalsHandler,
  gscSyncHandler,
  bingSyncHandler,
  alertsEvaluateHandler,
  alertWebhookHandler,
];

for (const handler of BUILT_IN_JOB_HANDLERS) {
  // A handler registered under the same type before this module loaded wins.
  if (!registry.has(handler.type)) registerJobHandler(handler);
}
