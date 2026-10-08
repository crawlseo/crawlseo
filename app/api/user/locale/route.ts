import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!isLocale(body?.locale))
    return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
  const response = NextResponse.json({ locale: body.locale });
  response.cookies.set(LOCALE_COOKIE, body.locale, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
