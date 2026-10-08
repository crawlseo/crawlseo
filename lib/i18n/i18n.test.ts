import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { getTranslator, isLocale, resolveLocale, languages } from "./index";
import type { Catalog, Message } from "./registry";
import enMessages from "./en.json";
import deMessages from "./de.json";

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const variants = (message: Message) =>
  typeof message === "string" ? [message] : Object.values(message);

describe("language catalogs", () => {
  it("contains every static message used by the interface", () => {
    const root = resolve(__dirname, "../..");
    function files(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap(
        (entry) => {
          const path = join(directory, entry.name);
          return entry.isDirectory()
            ? files(path)
            : path.endsWith(".tsx") && !path.includes(".test.")
              ? [path]
              : [];
        },
      );
    }
    for (const file of [
      ...files(join(root, "app")),
      ...files(join(root, "components")),
    ]) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "t" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          expect(
            Object.hasOwn(enMessages, node.arguments[0].text),
            `${file}: ${node.arguments[0].text}`,
          ).toBe(true);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  });
  for (const [locale, language] of Object.entries(languages)) {
    it(`${locale} covers all messages and preserves placeholders`, async () => {
      const catalog: Catalog = await language.load();
      expect(Object.keys(catalog).sort()).toEqual(
        Object.keys(enMessages).sort(),
      );
      for (const [key, source] of Object.entries(enMessages)) {
        const expected = placeholders(variants(source)[0]);
        for (const value of variants(catalog[key])) {
          expect(value.trim(), `${locale}: ${key}`).not.toBe("");
          expect(placeholders(value), `${locale}: ${key}`).toEqual(expected);
        }
      }
    });
  }
  it("accepts only registered language codes", () => {
    for (const code of Object.keys(languages))
      expect(isLocale(code)).toBe(true);
    for (const invalid of [
      undefined,
      null,
      "",
      "constructor",
      "__proto__",
      "<script>",
      "fr",
    ]) {
      expect(isLocale(invalid)).toBe(false);
      expect(resolveLocale(invalid)).toBe("en");
    }
  });
});

describe("translations", () => {
  const de = getTranslator("de", deMessages);
  const en = getTranslator("en");
  it("uses English by default and leaves unknown text untouched", () => {
    expect(en("Settings")).toBe("Settings");
    expect(de("Settings")).toBe("Einstellungen");
    expect(de("A newly added English message")).toBe(
      "A newly added English message",
    );
    expect(getTranslator("de", {})("Settings")).toBe("Settings");
    expect(de.stored("https://example.org/Settings?q=Warning")).toBe(
      "https://example.org/Settings?q=Warning",
    );
  });
  it("formats numbers and plural forms for each language", () => {
    expect(de("counts.pages", { count: 1 })).toBe("1 Seite");
    expect(de("counts.pages", { count: 0 })).toBe("0 Seiten");
    expect(de("counts.pages", { count: 1234 })).toBe("1.234 Seiten");
    expect(en("counts.pages", { count: 1234 })).toBe("1,234 pages");
    expect(de.number(12.3)).toBe("12,3");
  });
  it("keeps UTC dates independent of the server timezone", () => {
    expect(en.date("2026-10-08")).toBe("8 Oct");
    expect(de.date("2026-10-08", { year: true })).toBe("8. Okt. 2026");
    expect(de.date("2026-10-08T23:30:00Z", { time: true })).toBe(
      "8. Okt. 23:30 UTC",
    );
  });
  it("formats known numeric findings while preserving URL and ID values", () => {
    expect(
      de.stored("Position 15.3 · 1,234 impressions · push into top 3"),
    ).toBe("Position 15,3 · 1.234 Impressionen · in die Top 3 verbessern");
    expect(
      de.stored("2 landing pages competing · top: https://example.org/1234.5"),
    ).toBe(
      "2 konkurrierende Zielseiten · wichtigste: https://example.org/1234.5",
    );
    expect(de.stored("Crawl started (ID: 12345678...)")).toBe(
      "Crawl gestartet (ID: 12345678…)",
    );
  });
  it("interpolates literal values without interpreting replacement characters or markup", () => {
    expect(de("Site: {0}. Switch or add a site", { "0": "$& <script>" })).toBe(
      "Website: $& <script>. Website wechseln oder hinzufügen",
    );
    expect(de.stored("Crawl started (ID: abc123...)")).toBe(
      "Crawl gestartet (ID: abc123…)",
    );
    expect(de.stored("Duplicate title shared by 3 pages")).toBe(
      "Identischer Titel auf 3 Seiten",
    );
  });
});
