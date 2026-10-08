import { after } from "next/server";
import { randomUUID } from "node:crypto";
import type { BulkJob } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BULK_ACTIONS, buildTasks } from "@/lib/bulk/types";
import {
  ACTIVE_JOB_STATUSES,
  jobView,
  recoverBulkJobs,
} from "@/lib/bulk/store";
import { runBulkJob } from "@/lib/bulk/worker";

export const runtime = "nodejs";
const input = z.object({
  siteIds: z.array(z.string().min(1)).min(1).max(500),
  actions: z.array(z.enum(BULK_ACTIONS)).min(1).max(4),
  maxPages: z.number().int().min(1).max(2000).default(200),
  vitalsLimit: z.number().int().min(1).max(5).default(5),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  await recoverBulkJobs(session.user.id);
  const id = new URL(req.url).searchParams.get("id");
  const job = await db.bulkJob.findFirst({
    where: { userId: session.user.id, ...(id && { id }) },
    orderBy: { createdAt: "desc" },
  });
  if (id && !job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(
    { job: job ? jobView(job) : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid batch options" }, { status: 400 });
  const { actions, maxPages, vitalsLimit } = parsed.data;
  const siteIds = [...new Set(parsed.data.siteIds)];
  const sites = await db.site.findMany({
    where: { userId: session.user.id, id: { in: siteIds } },
    select: { id: true, domain: true, gscProperty: true, bingSite: true },
    orderBy: { domain: "asc" },
  });
  if (sites.length !== siteIds.length)
    return Response.json(
      { error: "One or more websites are unavailable" },
      { status: 404 },
    );
  const tasks = buildTasks(sites, actions);
  if (!tasks.some((task) => task.status === "pending"))
    return Response.json(
      { error: "No connected websites for these actions" },
      { status: 400 },
    );
  await recoverBulkJobs(session.user.id);
  const active = () =>
    db.bulkJob.findFirst({
      where: { userId: session.user!.id!, status: { in: ACTIVE_JOB_STATUSES } },
    });
  const existing = await active();
  if (existing)
    return Response.json(
      { error: "A batch is already running", job: jobView(existing) },
      { status: 409 },
    );
  // The partial unique index closes the race between the check and insert.
  // A competing start is an ordinary conflict, not a failed SQL statement.
  const [job] = await db.$queryRaw<BulkJob[]>`
    INSERT INTO "BulkJob" ("id", "userId", "tasks", "options")
    VALUES (${randomUUID()}, ${session.user.id}, ${JSON.stringify(tasks)}::jsonb, ${JSON.stringify({ maxPages, vitalsLimit })}::jsonb)
    ON CONFLICT DO NOTHING RETURNING *
  `;
  if (!job) {
    const current = await active();
    return Response.json(
      {
        error: "A batch is already running",
        job: current ? jobView(current) : null,
      },
      { status: 409 },
    );
  }
  after(() => runBulkJob(job.id));
  return Response.json({ job: jobView(job) }, { status: 202 });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = z
    .object({ id: z.string().min(1) })
    .safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "Invalid batch options" }, { status: 400 });
  const job = await db.bulkJob.findFirst({
    where: { id: body.data.id, userId: session.user.id },
  });
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  await db.bulkJob.updateMany({
    where: {
      id: job.id,
      userId: session.user.id,
      status: { in: ACTIVE_JOB_STATUSES },
    },
    data: { cancelRequested: true },
  });
  return Response.json({ success: true });
}
