import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWebhook, removeWebhook, saveWebhook } from "@/lib/user-settings";
import { assertWebhookTarget, InvalidWebhookUrlError, parseWebhookUrl } from "@/lib/webhooks/address";
import { webhooksEnabled } from "@/lib/webhooks/config";
import { checkSecret } from "@/lib/webhooks/deliver";
import { webhookStatus } from "@/lib/webhooks/status";

/*
 * The signed-in user's alert webhook: GET its status, PUT a URL and secret
 * (the secret may be left out to keep the saved one), DELETE it.
 */

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await webhookStatus(db, session.user.id));
}

export async function PUT(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!webhooksEnabled()) {
    return Response.json({ error: "Alert webhooks are turned off on this server." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { url?: unknown; secret?: unknown } | null;
  let url: URL;
  try {
    url = parseWebhookUrl(body?.url);
    await assertWebhookTarget(url);
  } catch (err) {
    if (err instanceof InvalidWebhookUrlError) return Response.json({ error: err.message, field: "url" }, { status: 400 });
    throw err;
  }

  const keepSecret = body?.secret === undefined || body.secret === "";
  const saved = keepSecret ? await getWebhook(db, userId) : null;
  const secret = keepSecret ? saved?.secret : undefined;
  const checked = secret ? { secret } : checkSecret(body?.secret);
  if ("error" in checked) return Response.json({ error: checked.error, field: "secret" }, { status: 400 });

  await saveWebhook(db, userId, { url: url.toString(), secret: checked.secret });
  return Response.json(await webhookStatus(db, userId));
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await removeWebhook(db, session.user.id);
  return Response.json(await webhookStatus(db, session.user.id));
}
