import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { testConnection } from "@/lib/dataforseo/client";
import { testBingKey } from "@/lib/bing";

/** Providers with a connection test. PageSpeed has none. */
const TESTABLE = ["dataforseo", "bing"] as const;
type Testable = (typeof TESTABLE)[number];

function runTest(provider: Testable, creds: { login?: string; password?: string; apiKey?: string }) {
  // Bing issues one account-wide key, sent as `apiKey`; DataForSEO a login and password.
  return provider === "bing"
    ? testBingKey(creds.apiKey ?? "")
    : testConnection(creds.login ?? "", creds.password ?? "");
}

/**
 * Tests credentials typed into the form, or with `saved: true` the key already
 * stored for the session user. A saved key is decrypted here and never sent
 * back: the response is only `{ success }`.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      provider?: string;
      saved?: boolean;
      login?: string;
      password?: string;
      apiKey?: string;
    };
    const provider = body.provider ?? "dataforseo";
    if (!TESTABLE.includes(provider as Testable)) {
      return Response.json({ error: "This provider has no connection test" }, { status: 400 });
    }

    if (body.saved === true) {
      const stored = await db.apiKey.findUnique({
        where: { userId_provider: { userId: session.user.id, provider } },
        select: { encryptedLogin: true, encryptedPassword: true },
      });
      if (!stored) {
        return Response.json({ error: "No saved key" }, { status: 404 });
      }
      if (provider === "dataforseo" && !stored.encryptedLogin) {
        return Response.json({ success: false });
      }
      let creds: { login?: string; password?: string; apiKey?: string };
      try {
        creds =
          provider === "bing"
            ? { apiKey: decrypt(stored.encryptedPassword) }
            : {
                login: decrypt(stored.encryptedLogin ?? ""),
                password: decrypt(stored.encryptedPassword),
              };
      } catch {
        // NEXTAUTH_SECRET changed since the key was saved: it cannot be read, so it cannot work.
        return Response.json({ success: false, error: "The saved key cannot be read. Replace it." });
      }
      return Response.json({ success: await runTest(provider as Testable, creds) });
    }

    if (provider === "bing" ? !body.apiKey : !body.login || !body.password) {
      return Response.json(
        { error: provider === "bing" ? "Missing API key" : "Missing login or password" },
        { status: 400 }
      );
    }
    return Response.json({ success: await runTest(provider as Testable, body) });
  } catch (error) {
    console.error("API key test error:", error);
    return Response.json({ error: "Connection test failed" }, { status: 500 });
  }
}
