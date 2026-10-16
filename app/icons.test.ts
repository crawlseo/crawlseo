import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

// Icons are lucide-react components, not emoji or glyph characters in the markup. A glyph renders in
// whatever font has it, at the text's size and baseline, and screen readers may read it out.
// "→" stays allowed: it is running text ("Settings → API keys", "a → b" value changes).

const root = resolve(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** Comments may use any character; blanks them out and keeps line numbers. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Emoji (Extended_Pictographic covers ⚡ ⭐ ↗ ↕ and the emoji blocks) plus the glyphs used as icons. */
const ICON_GLYPH = /[\p{Extended_Pictographic}\u{FE0F}⌘↻↗✦⚡⭐◎▲▼↕⊕◫]/u;
/** Running-text characters that may appear next to the glyphs above. */
const ALLOWED = new Set(["→", "©", "®", "™"]);

function findIconGlyphs(source: string): { line: number; char: string }[] {
  const hits: { line: number; char: string }[] = [];
  stripComments(source)
    .split("\n")
    .forEach((text, i) => {
      for (const char of text) {
        if (!ALLOWED.has(char) && ICON_GLYPH.test(char)) hits.push({ line: i + 1, char });
      }
    });
  return hits;
}

describe("icons", () => {
  it("finds glyphs in markup and strings, skips comments and running-text arrows", () => {
    expect(findIconGlyphs(`<EmptyState icon="⚡" />`)).toEqual([{ line: 1, char: "⚡" }]);
    expect(findIconGlyphs(`const a = "▲";\n<span>🚀</span>`).map((h) => h.char)).toEqual(["▲", "🚀"]);
    expect(findIconGlyphs(`<p>Settings → API keys</p>`)).toEqual([]);
    expect(findIconGlyphs(`// sort ▲ ▼\n/* ↗ */\n{/* ⭐ */}\nconst url = "https://x.test/";`)).toEqual([]);
  });

  it("has no emoji or glyph icons in app/ and components/ .tsx files", () => {
    const hits = [...tsxFiles(join(root, "app")), ...tsxFiles(join(root, "components"))].flatMap((file) =>
      findIconGlyphs(readFileSync(file, "utf8")).map(({ line, char }) => `${relative(root, file)}:${line} ${char}`)
    );
    expect(hits).toEqual([]);
  });
});
