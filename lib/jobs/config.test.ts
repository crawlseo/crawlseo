import { afterEach, describe, expect, it, vi } from "vitest";
import { isServerless, queueConfig, workerMode } from "./config";

afterEach(() => vi.restoreAllMocks());

describe("workerMode", () => {
  it("defaults to inline, so an install that sets nothing keeps running jobs in the app", () => {
    expect(workerMode({})).toBe("inline");
    expect(workerMode({ WORKER_MODE: " " })).toBe("inline");
  });

  it("reads inline, off and worker, in any case", () => {
    expect(workerMode({ WORKER_MODE: "off" })).toBe("off");
    expect(workerMode({ WORKER_MODE: "Worker" })).toBe("worker");
    expect(workerMode({ WORKER_MODE: " INLINE " })).toBe("inline");
  });

  it("falls back to inline for anything else, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(workerMode({ WORKER_MODE: "process" })).toBe("inline");
    expect(warn).toHaveBeenCalled();
  });
});

describe("queueConfig", () => {
  it("has defaults for everything", () => {
    expect(queueConfig({})).toEqual({
      longConcurrency: 1,
      shortConcurrency: 2,
      pollMs: 5000,
      shutdownGraceMs: 25_000,
      staleMs: 180_000,
    });
  });

  it("reads positive whole numbers and ignores the rest", () => {
    expect(
      queueConfig({
        WORKER_LONG_CONCURRENCY: "3",
        WORKER_SHORT_CONCURRENCY: "0",
        WORKER_POLL_SECONDS: "abc",
        WORKER_SHUTDOWN_GRACE_SECONDS: "10.7",
        JOB_STALE_SECONDS: "-1",
      })
    ).toEqual({ longConcurrency: 3, shortConcurrency: 2, pollMs: 5000, shutdownGraceMs: 10_000, staleMs: 180_000 });
  });
});

it("isServerless follows VERCEL", () => {
  expect(isServerless({})).toBe(false);
  expect(isServerless({ VERCEL: "1" })).toBe(true);
});
