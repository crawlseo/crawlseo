import { describe, expect, it } from "vitest";
import {
  ALERT_WEBHOOK_JOB,
  ALERTS_EVALUATE_JOB,
  BING_SYNC_JOB,
  BUILT_IN_JOB_HANDLERS,
  CRAWL_JOB,
  getJobHandler,
  GSC_SYNC_JOB,
  jobTypes,
  registerJobHandler,
  VITALS_JOB,
} from "./handlers";
import { isPermanentJobError, JobError } from "./types";

describe("job handler registry", () => {
  it("registers the six built-in types with their class and attempts", () => {
    expect(BUILT_IN_JOB_HANDLERS.map((h) => [h.type, h.class, h.maxAttempts])).toEqual([
      [CRAWL_JOB, "LONG", 2],
      [VITALS_JOB, "LONG", 2],
      [GSC_SYNC_JOB, "SHORT", 3],
      [BING_SYNC_JOB, "SHORT", 3],
      [ALERTS_EVALUATE_JOB, "SHORT", 3],
      [ALERT_WEBHOOK_JOB, "SHORT", 5],
    ]);
    for (const h of BUILT_IN_JOB_HANDLERS) expect(getJobHandler(h.type)).toBe(h);
  });

  it("lists types per class from the registry", () => {
    expect(jobTypes("LONG")).toEqual(expect.arrayContaining([CRAWL_JOB, VITALS_JOB]));
    expect(jobTypes("SHORT")).toEqual(expect.arrayContaining([GSC_SYNC_JOB, BING_SYNC_JOB, ALERTS_EVALUATE_JOB]));
    expect(jobTypes("LONG")).not.toContain(GSC_SYNC_JOB);
  });

  it("takes another type with no schema change, and lists it in its class", () => {
    registerJobHandler({ type: "extra-report", class: "LONG", maxAttempts: 4, isPermanent: () => false, run: async () => undefined });
    expect(getJobHandler("extra-report")?.maxAttempts).toBe(4);
    expect(jobTypes("LONG")).toContain("extra-report");
    expect(jobTypes("SHORT")).not.toContain("extra-report");
  });

  it("refuses a handler without a type or with fewer than one attempt", () => {
    const base = { class: "SHORT" as const, isPermanent: () => false, run: async () => undefined };
    expect(() => registerJobHandler({ ...base, type: " ", maxAttempts: 1 })).toThrow("needs a type");
    expect(() => registerJobHandler({ ...base, type: "bad", maxAttempts: 0 })).toThrow("at least 1");
    expect(() => registerJobHandler({ ...base, type: "bad", maxAttempts: 1.5 })).toThrow("at least 1");
  });

  it("a crawl that ran and failed is not retried; the stop on shutdown is", () => {
    const crawl = getJobHandler(CRAWL_JOB)!;
    expect(crawl.isPermanent(new Error("DNS lookup failed"))).toBe(true);
    expect(crawl.stopOnShutdown).toBe(true);
    expect(getJobHandler(VITALS_JOB)!.stopOnShutdown).toBeFalsy();
  });

  it("only a JobError marked permanent is permanent by default", () => {
    expect(isPermanentJobError(new JobError("x", { permanent: true }))).toBe(true);
    expect(isPermanentJobError(new JobError("x"))).toBe(false);
    expect(isPermanentJobError(new Error("x"))).toBe(false);
  });

  it("syncs queue an alert evaluation once they succeed", () => {
    expect(getJobHandler(GSC_SYNC_JOB)!.followUps).toBeDefined();
    expect(getJobHandler(BING_SYNC_JOB)!.followUps).toBeDefined();
    expect(getJobHandler(ALERT_WEBHOOK_JOB)!.followUps).toBeUndefined();
  });

  it("an evaluation queues a webhook delivery only when alerts fired and the user has a webhook", () => {
    const followUps = getJobHandler(ALERTS_EVALUATE_JOB)!.followUps!;
    const fires = [{ alertId: "a1", type: "TRAFFIC_DROP", message: "m", siteId: "s1", domain: "quilltab.app" }];
    const firedAt = "2026-10-19T05:00:00.000Z";
    expect(followUps({} as never, { fired: 1, fires, firedAt, webhook: true })).toEqual([
      { type: ALERT_WEBHOOK_JOB, payload: { fires, firedAt }, unique: false },
    ]);
    expect(followUps({} as never, { fired: 1, fires, firedAt, webhook: false })).toEqual([]);
    expect(followUps({} as never, { fired: 0, fires: [], firedAt, webhook: true })).toEqual([]);
    expect(followUps({} as never, undefined)).toEqual([]);
  });
});
