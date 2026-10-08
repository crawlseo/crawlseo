import { cache } from "react";
import { cookies } from "next/headers";
import { resolveTheme, THEME_COOKIE } from "./appearance";

export const getTheme = cache(async () =>
  resolveTheme((await cookies()).get(THEME_COOKIE)?.value),
);
