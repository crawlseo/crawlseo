import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailAvailable } from "@/lib/email/config";
import { testEmail } from "@/lib/email/messages";
import { parseRecipients } from "@/lib/email/recipients";
import { sendEmail } from "@/lib/email/send";
import { RateLimiter } from "@/lib/rate-limit";
import { getAlertEmail } from "@/lib/user-settings";

/*
 * Sends one test email and says whether the SMTP server took it. Takes the
 * addresses from the form, so they can be tried before saving; an empty form
 * falls back to the saved ones. One attempt, no retries. At most a few per
 * user per 10 minutes, so the form is no way to mail anyone through the
 * operator's server.
 */

const testLimiter = new RateLimiter(5, 10 * 60_000);

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailAvailable()) {
    return Response.json({ error: "Alert emails are turned off or not set up on this server." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { recipients?: unknown } | null;
  const given = typeof body?.recipients === "string" && body.recipients.trim() ? body.recipients : null;
  const parsed = parseRecipients(given ?? (await getAlertEmail(db, userId)).recipients.join(", "));
  if ("error" in parsed) return Response.json({ error: parsed.error, field: "recipients" }, { status: 400 });

  const limited = testLimiter.hit(userId);
  if (!limited.ok) {
    return Response.json(
      { error: `Too many test emails. Try again in ${Math.ceil(limited.retryAfterS / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterS) } }
    );
  }
  const result = await sendEmail(testEmail(parsed.recipients));
  if (!result.ok) console.error(`Test email failed: ${result.error}`);
  return Response.json(result.ok ? { ok: true } : { ok: false, error: result.error });
}
