import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

/** Providers that can be stored, and whether they need a password alongside the login. */
const PROVIDERS: Record<string, { needsPassword: boolean }> = {
  dataforseo: { needsPassword: true },
  bing: { needsPassword: false },
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await db.apiKey.findMany({
      where: { userId: session.user.id },
      select: { provider: true, createdAt: true, updatedAt: true },
    });

    const providers: Record<string, { connected: boolean; updatedAt?: string }> =
      Object.fromEntries(
        Object.keys(PROVIDERS).map((provider) => [provider, { connected: false }])
      );

    for (const key of keys) {
      providers[key.provider] = {
        connected: true,
        updatedAt: key.updatedAt.toISOString(),
      };
    }

    return Response.json(providers);
  } catch (error) {
    console.error("API keys GET error:", error);
    return Response.json({ error: "Failed to load API keys" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      provider?: string;
      login?: string;
      password?: string;
    };

    // hasOwn: a plain object also answers for "constructor" and "__proto__".
    const config =
      body.provider && Object.hasOwn(PROVIDERS, body.provider)
        ? PROVIDERS[body.provider]
        : undefined;
    if (!body.provider || !config) {
      return Response.json({ error: "Unsupported provider" }, { status: 400 });
    }

    if (!body.login || (config.needsPassword && !body.password)) {
      return Response.json(
        { error: "Missing required fields: provider, login, password" },
        { status: 400 }
      );
    }

    // Single-secret providers (Bing) store the key in `encryptedLogin` and
    // leave the password slot empty rather than growing the schema.
    const encryptedLogin = encrypt(body.login);
    const encryptedPassword = encrypt(body.password ?? "");

    const saved = await db.apiKey.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: body.provider,
        },
      },
      create: {
        userId: session.user.id,
        provider: body.provider,
        encryptedLogin,
        encryptedPassword,
      },
      update: { encryptedLogin, encryptedPassword },
    });

    return Response.json(
      { provider: saved.provider, connected: true },
      { status: 201 }
    );
  } catch (error) {
    console.error("API keys POST error:", error);
    return Response.json({ error: "Failed to save API key" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { provider?: string };
    if (!body.provider || !Object.hasOwn(PROVIDERS, body.provider)) {
      return Response.json({ error: "Unsupported provider" }, { status: 400 });
    }

    const userId = session.user.id;
    const deleteKey = db.apiKey.delete({
      where: { userId_provider: { userId, provider: body.provider } },
    });
    if (body.provider === "bing") {
      // Without a key no property can sync, and a key from another account
      // will not see these properties: disconnect them with the key.
      await db.$transaction([
        db.bingSearchWeekly.deleteMany({ where: { site: { userId } } }),
        db.bingDaily.deleteMany({ where: { site: { userId } } }),
        db.site.updateMany({
          where: { userId, bingSite: { not: null } },
          data: { bingSite: null },
        }),
        deleteKey,
      ]);
    } else {
      await deleteKey;
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("API keys DELETE error:", error);
    return Response.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
