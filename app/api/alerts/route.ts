import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDefaultAlerts, evaluateAlertsForUser } from "@/lib/alerts/evaluate";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const alerts = await db.alert.findMany({
      where: { userId: session.user.id },
      include: { site: { select: { domain: true } } },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(alerts);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      action?: "evaluate" | "ensure";
      siteId?: string;
    };

    if (body.action === "ensure" && body.siteId) {
      await ensureDefaultAlerts(session.user.id, body.siteId);
      return Response.json({ ok: true });
    }

    const fires = await evaluateAlertsForUser(session.user.id);
    return Response.json({ fires });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
