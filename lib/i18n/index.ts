import { formatDay } from "@/lib/format";
import en from "./en.json";
import { languages, type Catalog, type Locale, type Message } from "./registry";
export {
  DEFAULT_LOCALE,
  languages,
  LOCALE_COOKIE,
  isLocale,
  resolveLocale,
  type Locale,
} from "./registry";

export type Values = Record<string, string | number | null | undefined>;
const fallback: Catalog = en;

// Only these known numeric fields may be reformatted in English findings.
// Other interpolated values, including URLs, IDs and keywords, stay literal.
const storedNumericFields: Record<string, readonly string[]> = {
  "Position {0} · {1} impressions · push into top 3": ["0", "1"],
  "CTR {0}% vs ~{1}% expected at pos {2}: rewrite title/meta": ["0", "1", "2"],
  "Clicks {0} → {1} ({2}%) vs prior 28 days": ["0", "1", "2"],
  "{0} landing pages competing · top: {1}": ["0"],
};

function createTranslator(locale: Locale, messages: Catalog) {
  const { intlLocale } = languages[locale];
  const plurals = new Intl.PluralRules(intlLocale);
  const number = (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(intlLocale, options).format(value);
  function resolve(
    message: Message | undefined,
    values: Values,
  ): string | undefined {
    if (typeof message === "string") return message;
    if (!message) return undefined;
    return message[plurals.select(Number(values.count ?? 0))] ?? message.other;
  }
  function interpolate(message: string, values: Values): string {
    return message.replace(/\{(\w+)\}/g, (placeholder, key) => {
      if (!Object.hasOwn(values, key)) return placeholder;
      const value = values[key];
      return typeof value === "number" ? number(value) : String(value ?? "");
    });
  }

  // Stored findings and API errors use English messages. Translate only exact
  // catalogued templates; never rewrite URLs, keywords, or arbitrary page text.
  const patterns = Object.entries(fallback).flatMap(([key, source]) => {
    if (typeof source !== "string" || !/\{\w+\}/.test(source)) return [];
    const names: string[] = [];
    const escaped = source
      .split(/(\{\w+\})/g)
      .map((part) => {
        if (/^\{\w+\}$/.test(part)) {
          names.push(part.slice(1, -1));
          return "(.+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    return [{ pattern: new RegExp(`^${escaped}$`), names, key }];
  });
  const translate = (key: string, values: Values = {}): string =>
    interpolate(
      resolve(messages[key], values) ?? resolve(fallback[key], values) ?? key,
      values,
    );
  const stored = (message: string): string => {
    if (Object.hasOwn(fallback, message)) return translate(message);
    for (const entry of patterns) {
      const match = entry.pattern.exec(message);
      if (match)
        return translate(
          entry.key,
          Object.fromEntries(
            entry.names.map((name, i) => {
              const value = match[i + 1];
              if (
                storedNumericFields[entry.key]?.includes(name) &&
                /^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(value)
              ) {
                const decimals = value.split(".")[1]?.length ?? 0;
                return [
                  name,
                  number(Number(value.replaceAll(",", "")), {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                  }),
                ];
              }
              return [name, value];
            }),
          ),
        );
    }
    return message;
  };
  return Object.assign(translate, {
    locale,
    intlLocale,
    number,
    stored,
    date: (
      value: Date | string,
      options: { year?: boolean; time?: boolean } = {},
    ) => formatDay(value, { ...options, locale: intlLocale }),
  });
}

export type Translator = ReturnType<typeof createTranslator>;
export function getTranslator(
  locale: Locale,
  messages: Catalog = fallback,
): Translator {
  return createTranslator(locale, messages);
}
