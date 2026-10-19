import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWebhook } from "@/lib/user-settings";
import { webhooksEnabled } from "@/lib/webhooks/config";
import { checkSecret, sendWebhook, testPayload } from "@/lib/webhooks/deliver";

/*
 * Sends one test delivery, signed like an alert, and says what the webhook
 * answered. Takes the URL and secret from the form, so they can be tried
 * before saving; a missing one falls back to the saved value. One attempt,
 * no retries: the person sees the answer right away.
 */

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!webhooksEnabled()) {
    return Response.json({ error: "Alert webhooks are turned off on this server." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { url?: unknown; secret?: unknown } | null;
  const given = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const needSaved = !given(body?.url) || !given(body?.secret);
  const saved = needSaved ? await getWebhook(db, userId) : null;

  const url = given(body?.url) ?? saved?.url;
  if (!url) return Response.json({ error: "Enter the webhook URL.", field: "url" }, { status: 400 });
  const checked = given(body?.secret) ? checkSecret(body?.secret) : saved ? { secret: saved.secret } : checkSecret("");
  if ("error" in checked) return Response.json({ error: checked.error, field: "secret" }, { status: 400 });

  const result = await sendWebhook(url, checked.secret, "test", testPayload());
  return Response.json(
    result.ok ? { ok: true, status: result.status } : { ok: false, status: result.status ?? null, error: result.error }
  );
}
