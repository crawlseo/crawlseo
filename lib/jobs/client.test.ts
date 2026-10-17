import { describe, expect, it } from "vitest";
import { isFinished, pendingNote, type JobView } from "./client";

const base: JobView = {
  id: "j1",
  type: "gsc-sync",
  status: "QUEUED",
  attempts: 0,
  maxAttempts: 3,
  runAt: "2026-10-17T12:05:00.000Z",
  startedAt: null,
  finishedAt: null,
  lastError: null,
  errorCode: null,
  result: null,
  crawl: null,
  stalled: false,
};

describe("job client helpers", () => {
  it("a job is finished once it succeeded or failed", () => {
    expect(isFinished({ status: "QUEUED" })).toBe(false);
    expect(isFinished({ status: "RUNNING" })).toBe(false);
    expect(isFinished({ status: "SUCCEEDED" })).toBe(true);
    expect(isFinished({ status: "FAILED" })).toBe(true);
  });

  it("says nothing about a job that simply waits its turn", () => {
    expect(pendingNote(base)).toBeNull();
    expect(pendingNote({ ...base, status: "RUNNING", attempts: 1 })).toBeNull();
  });

  it("points at the worker when nothing picks jobs up", () => {
    expect(pendingNote({ ...base, stalled: true })).toContain("no worker is processing jobs");
  });

  it("says when a failed attempt is retried", () => {
    const note = pendingNote({ ...base, attempts: 1, lastError: "socket hang up" });
    expect(note).toContain("Attempt 1 of 3 failed: socket hang up.");
    expect(note).toContain("Trying again at 17 Oct 12:05");
  });
});
