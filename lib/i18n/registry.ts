export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Catalog = Readonly<Record<string, Message>>;

/** Add a catalog and an entry here to make a language available in Settings. */
export const languages = {
  en: {
    name: "English",
    intlLocale: "en-US",
    load: () => import("./en.json").then((module) => module.default),
  },
  de: {
    name: "Deutsch",
    intlLocale: "de-DE",
    load: () => import("./de.json").then((module) => module.default),
  },
} satisfies Record<string, { name: string; intlLocale: string; load: () => Promise<Catalog> }>;

export type Locale = keyof typeof languages;
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "crawlseo-locale";
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(languages, value);
}
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
