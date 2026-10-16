import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { API_KEY_PROVIDERS, apiKeyStatus, type ApiKeyProvider } from "@/lib/api-keys";

function isSupportedProvider(value: unknown): value is ApiKeyProvider {
  return typeof value === "string" && API_KEY_PROVIDERS.includes(value as ApiKeyProvider);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json(await apiKeyStatus(db, session.user.id));
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
      apiKey?: string;
    };

    if (!isSupportedProvider(body.provider)) {
      return Response.json({ error: "Unsupported provider" }, { status: 400 });
    }

    // dataforseo: login + password (Basic Auth style credentials).
    // google_pagespeed, bing: a single key string - no login concept.
    let encryptedLogin: string | null;
    let encryptedPassword: string;

    if (body.provider === "dataforseo") {
      if (!body.login || !body.password) {
        return Response.json(
          { error: "Missing required fields: login, password" },
          { status: 400 }
        );
      }
      encryptedLogin = encrypt(body.login);
      encryptedPassword = encrypt(body.password);
    } else {
      if (!body.apiKey) {
        return Response.json(
          { error: "Missing required field: apiKey" },
          { status: 400 }
        );
      }
      encryptedLogin = null;
      encryptedPassword = encrypt(body.apiKey);
    }

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
      update: {
        encryptedLogin,
        encryptedPassword,
      },
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
    if (!isSupportedProvider(body.provider)) {
      return Response.json({ error: "Unsupported provider" }, { status: 400 });
    }

    const userId = session.user.id;
    const deleteKey = db.apiKey.delete({
      where: { userId_provider: { userId, provider: body.provider } },
    });
    if (body.provider === "bing") {
      // Without a key no property can sync, and a key from another account
      // will not see these properties: disconnect them with the key. The
      // Site update goes first so its row locks wait for a sync in flight
      // (bing-sync.ts holds the Site row while it writes) and the wipe sees
      // the rows that sync committed.
      await db.$transaction([
        db.site.updateMany({
          where: { userId, bingSite: { not: null } },
          data: { bingSite: null },
        }),
        db.bingSearchWeekly.deleteMany({ where: { site: { userId } } }),
        db.bingDaily.deleteMany({ where: { site: { userId } } }),
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
