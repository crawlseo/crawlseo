import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

const SUPPORTED_PROVIDERS = ["dataforseo", "google_pagespeed"] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(value: unknown): value is Provider {
  return typeof value === "string" && SUPPORTED_PROVIDERS.includes(value as Provider);
}

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

    const providers: Record<string, { connected: boolean; updatedAt?: string }> = {
      dataforseo: { connected: false },
      google_pagespeed: { connected: false },
    };

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
      apiKey?: string;
    };

    if (!isSupportedProvider(body.provider)) {
      return Response.json({ error: "Unsupported provider" }, { status: 400 });
    }

    // dataforseo: login + password (Basic Auth style credentials).
    // google_pagespeed: a single key string - no login concept.
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

    await db.apiKey.delete({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: body.provider,
        },
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("API keys DELETE error:", error);
    return Response.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
