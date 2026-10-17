import { formatDay } from "@/lib/format";
import type { JobView } from "./site-jobs";

/*
 * Browser side of the job queue: the buttons queue a job (202 with a job id)
 * and wait for it here by polling GET /api/jobs/[jobId].
 */

export type { JobView };

export const JOB_POLL_MS = 2000;

export function isFinished(job: Pick<JobView, "status">): boolean {
  return job.status === "SUCCEEDED" || job.status === "FAILED";
}

export async function fetchJob(jobId: string): Promise<JobView | null> {
  const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
  if (res.status === 404) throw new Error("The job no longer exists");
  if (!res.ok) return null;
  return (await res.json()) as JobView;
}

/** Done waiting: it finished, or it waits for an attempt that nothing will start (see JobView.waiting). */
export function isSettled(job: Pick<JobView, "status" | "waiting">): boolean {
  return isFinished(job) || job.waiting;
}

/** Polls until the job succeeded, failed, or waits with nothing to run it. `onUpdate` sees every state on the way. */
export async function waitForJob(
  jobId: string,
  { onUpdate, intervalMs = JOB_POLL_MS }: { onUpdate?: (job: JobView) => void; intervalMs?: number } = {}
): Promise<JobView> {
  for (;;) {
    const job = await fetchJob(jobId).catch((err: unknown) => {
      if (err instanceof Error && err.message === "The job no longer exists") throw err;
      return null; // a network hiccup: try again
    });
    if (job) {
      onUpdate?.(job);
      if (isSettled(job)) return job;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * What to tell the user while a job waits: nothing picks jobs up, or an
 * attempt failed and the job retries later. Null when there is nothing to say.
 */
export function pendingNote(job: JobView): string | null {
  if (job.stalled) {
    return "Queued, but no worker is processing jobs. Check that the worker service is running.";
  }
  if (job.waiting) {
    return (
      `Attempt ${job.attempts} of ${job.maxAttempts} failed: ${job.lastError ?? "unknown error"}. ` +
      `Next attempt at ${formatDay(job.nextAttemptAt ?? job.runAt, { time: true })}, or retry now.`
    );
  }
  if (job.status === "QUEUED" && job.attempts > 0 && job.lastError) {
    return (
      `Attempt ${job.attempts} of ${job.maxAttempts} failed: ${job.lastError}. ` +
      `Trying again at ${formatDay(job.runAt, { time: true })}.`
    );
  }
  return null;
}
