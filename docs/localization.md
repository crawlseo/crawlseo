# Interface languages

The interface currently offers English and German in **Settings → Language**.
The choice applies to all sites in the current browser. It is stored for a year
in the `crawlseo-locale` cookie, which is HttpOnly, SameSite=Lax, and Secure on
HTTPS. An absent or unsupported value uses English. No database migration is
required.

## Add a language

1. Copy `lib/i18n/en.json` to a new catalog, for example `fr.json`.
2. Translate the values, leaving keys and placeholders unchanged. The English
   wording is the key for most messages; reusable plural messages have semantic
   keys such as `counts.pages`.
3. Add one entry to `languages` in `lib/i18n/registry.ts`, with the native language
   name, its `Intl` locale, and a lazy catalog loader. The language type, cookie
   validation, and Settings options are derived from this registry.
4. Run `npm test` and `npm run build`. Check the translated UI, including narrow
   screens and long messages.

The catalog test requires every shipped language to cover the English catalog
and retain every placeholder. At runtime, missing messages fall back to English.
Plural messages use `Intl.PluralRules` and support `zero`, `one`, `two`, `few`,
`many`, and `other`. Always provide `other`; supply `count` when translating.

```json
{
  "Settings": "Einstellungen",
  "counts.pages": { "one": "{count} Seite", "other": "{count} Seiten" }
}
```

## Use translations

Server components call `await getT()` from `lib/i18n/server`. Client components
call `useT()` from `components/i18n/provider`. Both use the same request locale
and catalog. RootLayout sets `<html lang>` and sends the selected catalog to the
client provider; other languages are loaded lazily rather than bundled eagerly.
The English fallback remains available in both environments.

Use `t("Settings")`, `t("counts.pages", { count })`, `t.number(value, options)`,
and `t.date(value, options)`. Date formatting retains the application's UTC
semantics. Keep complete sentences together and use placeholders for values.
React renders interpolated text normally, without HTML interpretation.

`t.stored(message)` is for existing application-owned English status messages
and persisted crawl findings. It only matches exact catalog entries or anchored
catalogued templates. Prefer a keyed `t(...)` call for new interface messages.
Do not pass user-entered keywords, domains, page titles, URLs, or third-party
page content through translation. API identifiers, MCP tool names, enum values,
and machine-readable exports remain stable across interface languages.
