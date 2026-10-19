import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseScheduleDays, type ScheduleView } from "@/lib/schedule-settings";
import { getScheduleSettings, saveScheduleSettings, scheduleServerInfo } from "@/lib/user-settings";

/*
 * Settings > Schedule: how often the signed-in user's sites are crawled and
 * get a vitals check. null keeps the server default, 0 turns it off.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const view: ScheduleView = { ...(await getScheduleSettings(db, session.user.id)), server: scheduleServerInfo() };
  return Response.json(view);
}

export async function PUT(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { crawlDays?: unknown; vitalsDays?: unknown } | null;
  const crawlDays = parseScheduleDays(body?.crawlDays);
  const vitalsDays = parseScheduleDays(body?.vitalsDays);
  if (crawlDays === undefined || vitalsDays === undefined) {
    return Response.json(
      { error: "Each interval is a whole number of days from 0 (off) to 90, or null for the server default." },
      { status: 400 }
    );
  }
  await saveScheduleSettings(db, userId, { crawlDays, vitalsDays });
  const view: ScheduleView = { crawlDays, vitalsDays, server: scheduleServerInfo() };
  return Response.json(view);
}
