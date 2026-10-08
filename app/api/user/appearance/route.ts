import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isTheme, THEME_COOKIE } from "@/lib/appearance";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!isTheme(body?.theme))
    return NextResponse.json(
      { error: "Unsupported appearance" },
      { status: 400 },
    );
  const response = NextResponse.json({ theme: body.theme });
  response.cookies.set(THEME_COOKIE, body.theme, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
