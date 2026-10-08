import { cache } from "react";
import { cookies } from "next/headers";
import { getTranslator, LOCALE_COOKIE, resolveLocale, languages, type Locale } from "./index";

export const getLocale = cache(async () =>
  resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value),
);
export const getMessages = cache(async (locale: Locale) => languages[locale].load());
export const getT = cache(async () => {
  const locale = await getLocale();
  return getTranslator(locale, await getMessages(locale));
});
