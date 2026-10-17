import type { PrismaClient } from "@prisma/client";
import { isServerless, queueConfig, workerMode } from "./config";
import { JobLoop } from "./loop";
import { JobRunner } from "./runner";
import { scheduleOnMaintenance } from "./scheduler";

/*
 * WORKER_MODE=inline on a long-running server: the app process runs the job
 * loop itself, as crawls ran in the app before the queue existed. One loop per
 * process, on globalThis so a second copy of this module finds it.
 */

const holder = globalThis as unknown as { crawlseoInlineJobLoop?: JobLoop };

export function inlineJobLoop(): JobLoop | undefined {
  return holder.crawlseoInlineJobLoop;
}

/** Starts the inline loop when this process should run one. Returns it, or null. */
export function startInlineJobLoop(db: PrismaClient): JobLoop | null {
  if (workerMode() !== "inline" || isServerless()) return null;
  if (holder.crawlseoInlineJobLoop) return holder.crawlseoInlineJobLoop;
  const config = queueConfig();
  const loop = new JobLoop(db, new JobRunner(db), {
    mode: "inline",
    ...config,
    onMaintenance: scheduleOnMaintenance(db),
  });
  holder.crawlseoInlineJobLoop = loop;
  loop.start();
  return loop;
}
