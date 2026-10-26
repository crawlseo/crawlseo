import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAvailable } from "@/lib/email/config";
import { parseRecipients } from "@/lib/email/recipients";
import { emailStatus } from "@/lib/email/status";
import { saveAlertEmail } from "@/lib/user-settings";

/*
 * The signed-in user's alert emails: GET the status, PUT the recipients and
 * the on/off switch. The SMTP settings come from the environment and are
 * never part of either.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await emailStatus(db, session.user.id));
}

export async function PUT(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailAvailable()) {
    return Response.json({ error: "Alert emails are turned off or not set up on this server." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { recipients?: unknown; on?: unknown } | null;
  const parsed = parseRecipients(body?.recipients);
  if ("error" in parsed) return Response.json({ error: parsed.error, field: "recipients" }, { status: 400 });
  await saveAlertEmail(db, userId, { recipients: parsed.recipients, enabled: body?.on === true });
  return Response.json(await emailStatus(db, userId));
}
