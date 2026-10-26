import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Alert emails through the job queue on PGlite, against a local SMTP server
// and a local webhook receiver: one evaluation fans out to both, a failed
// email is retried or failed without blocking anything, and neither the job
// row, the log nor the Settings status carries the SMTP login.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { startTestSmtp, type TestSmtp } from "@/lib/testing/smtp";
import { ALERT_EMAIL_JOB, ALERT_WEBHOOK_JOB, ALERTS_EVALUATE_JOB } from "@/lib/jobs/handlers";
import { claimJobById, enqueueJob } from "@/lib/jobs/queue";
import { JobRunner } from "@/lib/jobs/runner";
import { saveAlertEmail, saveWebhook } from "@/lib/user-settings";
import { queueAlertDeliveries } from "@/lib/webhooks/queue-alerts";
import { emailStatus } from "./status";

const USER = "mailer@quilltab.app";
const PASS = "hunter2-very-secret";
let t: TestDb;
let db: PrismaClient;
let smtp: TestSmtp;
let hook: Server;
let hookHits = 0;
let logs: string[] = [];

beforeAll(async () => {
  smtp = await startTestSmtp();
  hook = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      hookHits++;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => hook.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-for-encryption-only");
  vi.stubEnv("ALERT_WEBHOOK_ALLOW_PRIVATE", "true");
  vi.stubEnv("SMTP_HOST", "127.0.0.1");
  vi.stubEnv("SMTP_PORT", String(smtp.port));
  vi.stubEnv("SMTP_SECURE", "false");
  vi.stubEnv("SMTP_USER", USER);
  vi.stubEnv("SMTP_PASSWORD", PASS);
  vi.stubEnv("SMTP_FROM", "seo@quilltab.app");
  t = await createTestDb();
  db = holder.db = t.db;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "quilltab.app" } });
  const url = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/alerts`;
  await saveWebhook(db, "u1", { url, secret: "s3cret-s3cret-s3cret" });
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => hook.close(resolve));
  await smtp.close();
  await t?.close();
});

beforeEach(async () => {
  smtp.mode = "ok";
  smtp.mails.length = 0;
  hookHits = 0;
  logs = [];
  vi.stubEnv("ALERT_EMAILS_ENABLED", "");
  await db.job.deleteMany();
  await db.alert.deleteMany();
  await db.auditPage.deleteMany();
  await db.crawl.deleteMany();
  await saveAlertEmail(db, "u1", { recipients: ["a@quilltab.app", "b@quilltab.app"], enabled: true });
});

const FIRES = [{ alertId: "a1", type: "NOINDEX_SITEWIDE", message: "Most pages are noindex on quilltab.app", siteId: "s1", domain: "quilltab.app" }];

async function runNow(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { runAt: new Date() } });
  const runner = new JobRunner(db, { log: (m) => logs.push(m) });
  const claimed = await claimJobById(db, { workerId: runner.workerId, jobId });
  if (!claimed) throw new Error("not claimable");
  return runner.execute(claimed);
}

/** A site whose latest crawl is all noindex, with its NOINDEX_SITEWIDE alert on. */
async function noindexSite() {
  const crawl = await db.crawl.create({ data: { siteId: "s1", status: "COMPLETED", healthScore: 100, finishedAt: new Date() } });
  await db.auditPage.createMany({
    data: Array.from({ length: 5 }, (_, i) => ({ crawlId: crawl.id, url: `https://quilltab.app/${i}`, statusCode: 200, indexable: false })),
  });
  await db.alert.create({ data: { userId: "u1", siteId: "s1", type: "NOINDEX_SITEWIDE", channel: "EMAIL", config: {} } });
}

async function queueEmail() {
  const { job } = await enqueueJob(db, {
    type: ALERT_EMAIL_JOB,
    siteId: "s1",
    source: "chain",
    payload: { fires: FIRES, firedAt: "2026-10-26T05:00:00.000Z" },
    unique: false,
  });
  return job;
}

describe("alert fan-out", () => {
  it("one evaluation sends the same alerts to the webhook and by email", async () => {
    await noindexSite();
    const { job } = await enqueueJob(db, { type: ALERTS_EVALUATE_JOB, siteId: "s1", source: "chain" });
    const run = await runNow(job.id);
    expect(run.outcome).toBe("succeeded");
    expect(run.followUps.map((f) => f.type).sort()).toEqual([ALERT_EMAIL_JOB, ALERT_WEBHOOK_JOB]);
    for (const f of run.followUps) expect((await runNow(f.id)).outcome).toBe("succeeded");

    expect(hookHits).toBe(1);
    expect(smtp.mails).toHaveLength(1);
    expect(smtp.mails[0].to).toEqual(["a@quilltab.app", "b@quilltab.app"]);
    expect(smtp.mails[0].data).toContain("5 of 5 pages are noindex");
    expect((await emailStatus(db, "u1")).lastEmail).toMatchObject({ status: "sent", error: null });
  });

  it("no email when the user turned it off, or the server did", async () => {
    await noindexSite();
    await saveAlertEmail(db, "u1", { recipients: ["a@quilltab.app"], enabled: false });
    expect((await queueAlertDeliveries(db, "u1", FIRES, { source: "manual" })).map((j) => j.type)).toEqual([ALERT_WEBHOOK_JOB]);

    await saveAlertEmail(db, "u1", { recipients: ["a@quilltab.app"], enabled: true });
    vi.stubEnv("ALERT_EMAILS_ENABLED", "false");
    expect((await queueAlertDeliveries(db, "u1", FIRES, { source: "manual" })).map((j) => j.type)).toEqual([ALERT_WEBHOOK_JOB]);
  });

  it("Evaluate now queues both channels", async () => {
    const jobs = await queueAlertDeliveries(db, "u1", FIRES, { source: "manual" });
    expect(jobs.map((j) => j.type)).toEqual([ALERT_WEBHOOK_JOB, ALERT_EMAIL_JOB]);
  });
});

describe("alert-email job", () => {
  it("retries a temporary failure, then sends", async () => {
    const job = await queueEmail();
    smtp.mode = "temp-fail";
    expect((await runNow(job.id)).outcome).toBe("retry");
    expect((await emailStatus(db, "u1")).lastEmail).toMatchObject({ status: "retrying", attempts: 1 });
    smtp.mode = "ok";
    expect((await runNow(job.id)).outcome).toBe("succeeded");
    expect(smtp.mails).toHaveLength(1);
  });

  it("fails a refused login at once, and nothing stored, shown or logged carries the login", async () => {
    const job = await queueEmail();
    smtp.mode = "auth-fail";
    expect((await runNow(job.id)).outcome).toBe("failed");
    const row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "FAILED", errorCode: "SMTP" });
    const status = await emailStatus(db, "u1");
    expect(status.lastEmail).toMatchObject({ status: "failed", error: expect.stringMatching(/refused the login/) });

    const everything = JSON.stringify([row, status, logs]);
    expect(everything).not.toContain(PASS);
    expect(everything).not.toContain(USER);
    expect(everything).not.toContain(Buffer.from(PASS).toString("base64"));
  });

  it("fails without a send when the user turned emails off while it waited", async () => {
    const job = await queueEmail();
    await saveAlertEmail(db, "u1", { recipients: ["a@quilltab.app"], enabled: false });
    expect((await runNow(job.id)).outcome).toBe("failed");
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ errorCode: "NOT_CONFIGURED" });
    expect(smtp.mails).toHaveLength(0);
  });
});

describe("emailStatus", () => {
  it("says SMTP is set up without saying how", async () => {
    const status = await emailStatus(db, "u1");
    expect(status).toMatchObject({ enabled: true, configured: true, on: true, recipients: ["a@quilltab.app", "b@quilltab.app"] });
    const json = JSON.stringify(status);
    for (const secret of [PASS, USER, "127.0.0.1", String(smtp.port), "seo@quilltab.app"]) expect(json).not.toContain(secret);
  });
});
