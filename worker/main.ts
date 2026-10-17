import { db } from "@/lib/db";
import { crashHandlers, startWorker, type Worker } from "./worker";

// Entry point of the worker process. Bundled to worker.cjs (npm run
// build:worker); in development: npm run worker.

async function main() {
  let worker: Worker | undefined;
  const crash = crashHandlers(() => worker, { exit: (code) => process.exit(code) });
  process.on("unhandledRejection", crash.unhandledRejection);
  process.on("uncaughtException", (err) => void crash.uncaughtException(err));

  try {
    worker = await startWorker(db);
  } catch (err) {
    console.error(`[worker] ${err instanceof Error ? err.message : String(err)}`);
    await db.$disconnect().catch(() => {});
    process.exit(1);
  }

  let signals = 0;
  const onSignal = (signal: NodeJS.Signals) => {
    // A second signal stops at once; recovery takes the jobs back later.
    if (++signals > 1) process.exit(1);
    void worker!
      .shutdown(signal)
      .then(() => db.$disconnect())
      .then(() => process.exit(0))
      .catch((err) => {
        console.error("[worker] shutdown failed:", err);
        process.exit(1);
      });
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
}

void main();
