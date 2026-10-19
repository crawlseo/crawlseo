import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import type { AddressInfo } from "net";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Alert webhooks through the job queue on PGlite, against a local receiver:
// a fired evaluation queues one delivery, a delivery that fails for a reason
// a retry can fix waits with backoff and is sent again under the same id, any
// other failure ends it at once. The receiver is on loopback, so the private
// address opt-in is on here.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { ALERT_WEBHOOK_JOB, ALERTS_EVALUATE_JOB } from "@/lib/jobs/handlers";
import { claimJobById, enqueueJob } from "@/lib/jobs/queue";
import { JobRunner } from "@/lib/jobs/runner";
import { removeWebhook, saveWebhook } from "@/lib/user-settings";
import { queueAlertWebhooks } from "./queue-alerts";
import { webhookStatus } from "./status";

const MIN = 60_000;
let t: TestDb;
let db: PrismaClient;
let server: Server;
let url = "";
let hits: { headers: IncomingMessage["headers"]; body: string }[] = [];
let answer: (res: ServerResponse) => void;

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-for-encryption-only");
  vi.stubEnv("ALERT_WEBHOOK_ALLOW_PRIVATE", "true");
  t = await createTestDb();
  db = holder.db = t.db;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ headers: req.headers, body });
      answer(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/alerts`;
  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.user.create({ data: { id: "u2", email: "other@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "quilltab.app" } });
  await db.site.create({ data: { id: "s2", userId: "u2", domain: "other.quilltab.app" } });
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((resolve) => server.close(resolve));
  await t?.close();
});

beforeEach(async () => {
  hits = [];
  answer = (res) => res.end("ok");
  await db.job.deleteMany();
  await db.alert.deleteMany();
  await db.crawl.deleteMany();
  await saveWebhook(db, "u1", { url, secret: "s3cret-s3cret-s3cret" });
});

const FIRES = [{ alertId: "a1", type: "CRAWL_ISSUES", message: "Crawl health 50/100 on quilltab.app", siteId: "s1", domain: "quilltab.app" }];

async function queueDelivery(siteId = "s1") {
  const { job } = await enqueueJob(db, {
    type: ALERT_WEBHOOK_JOB,
    siteId,
    source: "chain",
    payload: { fires: FIRES, firedAt: "2026-10-19T05:00:00.000Z" },
    unique: false,
  });
  return job;
}

/** Claims and runs the job now, whatever its runAt. */
async function runNow(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { runAt: new Date() } });
  const runner = new JobRunner(db, { log: () => {} });
  const claimed = await claimJobById(db, { workerId: runner.workerId, jobId });
  if (!claimed) throw new Error("not claimable");
  return runner.execute(claimed);
}

const status = (code: number) => (res: ServerResponse) => {
  res.statusCode = code;
  res.end();
};

describe("alert-webhook job", () => {
  it("delivers the alerts once, signed, under the job id", async () => {
    const job = await queueDelivery();
    expect((await runNow(job.id)).outcome).toBe("succeeded");
    expect(hits).toHaveLength(1);
    expect(hits[0].headers["x-crawlseo-delivery"]).toBe(job.id);
    expect(hits[0].headers["x-crawlseo-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(JSON.parse(hits[0].body)).toMatchObject({ event: "alert.fired", id: job.id, alerts: [{ id: "a1" }] });
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "SUCCEEDED",
      result: { status: 200, alerts: 1 },
    });
    expect((await webhookStatus(db, "u1")).lastDelivery).toMatchObject({ status: "delivered", httpStatus: 200 });
  });

  it("retries a 503 with backoff and sends the same delivery id again", async () => {
    const job = await queueDelivery();
    answer = status(503);
    const before = Date.now();
    expect((await runNow(job.id)).outcome).toBe("retry");
    const waiting = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(waiting).toMatchObject({ status: "QUEUED", attempts: 1, errorCode: "HTTP_503" });
    expect(waiting.runAt.getTime() - before).toBeGreaterThanOrEqual(0.8 * MIN - 1000);
    expect(waiting.runAt.getTime() - before).toBeLessThanOrEqual(1.2 * MIN + 1000);
    expect((await webhookStatus(db, "u1")).lastDelivery).toMatchObject({ status: "retrying", attempts: 1, httpStatus: 503 });

    answer = status(204);
    expect((await runNow(job.id)).outcome).toBe("succeeded");
    expect(hits.map((h) => h.headers["x-crawlseo-delivery"])).toEqual([job.id, job.id]);
  });

  it("fails after five attempts that all failed", async () => {
    const job = await queueDelivery();
    answer = status(500);
    const outcomes = [];
    for (let i = 0; i < 5; i++) outcomes.push((await runNow(job.id)).outcome);
    expect(outcomes).toEqual(["retry", "retry", "retry", "retry", "failed"]);
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "FAILED", attempts: 5 });
    expect(hits).toHaveLength(5);
  });

  it("fails at once on an answer no retry can fix", async () => {
    const job = await queueDelivery();
    answer = status(410);
    expect((await runNow(job.id)).outcome).toBe("failed");
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "FAILED", attempts: 1, errorCode: "HTTP_410" });
  });

  it("fails without a request when the webhook was removed while it waited", async () => {
    const job = await queueDelivery();
    await removeWebhook(db, "u1");
    expect((await runNow(job.id)).outcome).toBe("failed");
    expect(await db.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ errorCode: "NOT_CONFIGURED" });
    expect(hits).toHaveLength(0);
  });
});

describe("queueing deliveries", () => {
  async function fireableAlert() {
    await db.alert.create({ data: { userId: "u1", siteId: "s1", type: "CRAWL_ISSUES", channel: "WEBHOOK", config: {} } });
    await db.crawl.create({ data: { siteId: "s1", status: "COMPLETED", healthScore: 50, issuesFound: 9, finishedAt: new Date() } });
  }

  async function evaluate() {
    const { job } = await enqueueJob(db, { type: ALERTS_EVALUATE_JOB, siteId: "s1", source: "chain" });
    const run = await runNow(job.id);
    expect(run.outcome).toBe("succeeded");
    return run.followUps.map((f) => f.type);
  }

  it("an alert that fired queues a delivery; one that keeps firing is sent again only a day later", async () => {
    await fireableAlert();
    expect(await evaluate()).toEqual([ALERT_WEBHOOK_JOB]);
    // The next sync evaluates again the same day: still firing, not sent again.
    expect(await evaluate()).toEqual([]);
    // A day later it still fires: sent again, as a delivery of its own.
    await db.alert.updateMany({ data: { lastFired: new Date(Date.now() - 21 * 60 * MIN) } });
    expect(await evaluate()).toEqual([ALERT_WEBHOOK_JOB]);

    const deliveries = await db.job.findMany({ where: { type: ALERT_WEBHOOK_JOB }, orderBy: { createdAt: "asc" } });
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0].payload).toMatchObject({ fires: [{ type: "CRAWL_ISSUES", siteId: "s1", previousFiredAt: null }] });
    expect(deliveries[1].payload).toMatchObject({ fires: [{ previousFiredAt: expect.any(String) }] });
  });

  it("an evaluation queues nothing for a user without a webhook", async () => {
    await fireableAlert();
    await removeWebhook(db, "u1");
    const { job } = await enqueueJob(db, { type: ALERTS_EVALUATE_JOB, siteId: "s1", source: "chain" });
    expect((await runNow(job.id)).followUps).toEqual([]);
    expect(await db.job.count({ where: { type: ALERT_WEBHOOK_JOB } })).toBe(0);
  });

  it("Evaluate now queues one delivery per site, and none when webhooks are off on the server", async () => {
    const jobs = await queueAlertWebhooks(db, "u1", FIRES, { source: "manual" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: ALERT_WEBHOOK_JOB, siteId: "s1", source: "manual", activeKey: null });
    // Clicking again right after: those alerts already went out.
    const again = FIRES.map((f) => ({ ...f, previousFiredAt: new Date().toISOString() }));
    expect(await queueAlertWebhooks(db, "u1", again, { source: "manual" })).toEqual([]);

    vi.stubEnv("ALERT_WEBHOOKS_ENABLED", "false");
    try {
      expect(await queueAlertWebhooks(db, "u1", FIRES, { source: "manual" })).toEqual([]);
    } finally {
      vi.stubEnv("ALERT_WEBHOOKS_ENABLED", "");
    }
  });

  it("another user's deliveries do not show in a user's status", async () => {
    await queueDelivery("s2");
    expect((await webhookStatus(db, "u1")).lastDelivery).toBeNull();
  });
});
