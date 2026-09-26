import { auth } from "@/lib/auth";
import { testConnection } from "@/lib/dataforseo/client";
import { testBingKey } from "@/lib/bing";

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
    const provider = body.provider ?? "dataforseo";

    // Bing issues one account-wide key. It travels as `apiKey`, the field the
    // save route stores for single-key providers, and has no password to check.
    if (provider === "bing") {
      if (!body.apiKey) {
        return Response.json({ error: "Missing API key" }, { status: 400 });
      }
      return Response.json({ success: await testBingKey(body.apiKey) });
    }

    if (!body.login || !body.password) {
      return Response.json(
        { error: "Missing login or password" },
        { status: 400 }
      );
    }

    const ok = await testConnection(body.login, body.password);
    return Response.json({ success: ok });
  } catch (error) {
    console.error("API key test error:", error);
    return Response.json({ error: "Connection test failed" }, { status: 500 });
  }
}
