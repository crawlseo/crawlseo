import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

// Static guards for "light only" and the two brand fonts. The browser check
// (dark mode emulated, computed styles) lives in e2e/light-only.e2e.ts.

const root = resolve(__dirname, "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
const fonts = readFileSync(join(root, "app/fonts.ts"), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css|svg)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Value of a custom property declared in globals.css, following var() references. */
function token(name: string): string {
  const match = css.match(new RegExp(`\\s${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`${name} is not declared`);
  const value = match[1].trim();
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? token(ref[1]) : value;
}

describe("light only", () => {
  it("has no dark theme path in the app", () => {
    for (const file of [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "components"))]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/prefers-color-scheme:\s*dark/);
      expect(text, file).not.toMatch(/@custom-variant dark|\.dark\b|\bdark:[a-z]/);
      expect(text, file).not.toMatch(/classList\.(add|toggle)\(\s*["']dark/);
    }
  });

  it("declares color-scheme light on html and in the viewport", () => {
    expect(css).toMatch(/html\s*\{[^}]*color-scheme:\s*light/);
    expect(layout).toMatch(/colorScheme:\s*"light"/);
  });

  it("paints the body with the light background token", () => {
    expect(css).toMatch(/body\s*\{[^}]*bg-background/);
    expect(token("--background").toLowerCase()).toBe("#ffffff");
  });
});

describe("fonts", () => {
  /** The localFont({...}) calls in app/fonts.ts. */
  const calls = [...fonts.matchAll(/localFont\(\{([\s\S]*?)\n\}\);/g)].map((m) => m[1]);
  const files = calls.map((call) => call.match(/fonts\/([\w-]+)\.woff2/)?.[1]);

  it("self-hosts both fonts with next/font/local, nothing from Google at build time", () => {
    for (const file of [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "components"))]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from "next\/font\/google"/);
    }
    expect(layout).toMatch(/^import "\.\/fonts";$/m);
    expect(calls).toHaveLength(13);
    expect(fonts.match(/^export const \w+ = localFont\(/gm)).toHaveLength(13);
    for (const call of calls) {
      const src = call.match(/src: "\.\/(fonts\/[\w-]+\.woff2)"/)?.[1];
      expect(src && existsSync(join(root, "app", src)), call).toBe(true);
      expect(call).toMatch(/prop: "font-family", value: "(Inter|'Geist Mono')"/);
      expect(call).toMatch(/prop: "unicode-range", value: "U\+/);
    }
    // Only latin is preloaded, as next/font/google did with subsets: ["latin"].
    const preloaded = calls.filter((call) => !/preload: false/.test(call));
    expect(preloaded.map((call) => call.match(/fonts\/([\w-]+)\.woff2/)?.[1])).toEqual([
      "inter-latin",
      "geist-mono-latin",
    ]);
    // Latin is declared last in each family, as Google orders it: where
    // unicode-ranges overlap, the last face wins.
    expect(files.indexOf("inter-latin")).toBe(files.filter((f) => f?.startsWith("inter-")).length - 1);
    expect(files.at(-1)).toBe("geist-mono-latin");
    expect(existsSync(join(root, "app/fonts/Inter-OFL.txt"))).toBe(true);
    expect(existsSync(join(root, "app/fonts/GeistMono-OFL.txt"))).toBe(true);
  });

  it("names the families and their metric-matched fallbacks", () => {
    expect(token("--font-inter")).toBe('"Inter", "Inter Fallback"');
    expect(token("--font-geist-mono")).toBe('"Geist Mono", "Geist Mono Fallback"');
    expect(css).toMatch(/@font-face\s*\{\s*font-family: "Inter Fallback";\s*src: local\("Arial"\);/);
    expect(css).toMatch(/@font-face\s*\{\s*font-family: "Geist Mono Fallback";\s*src: local\("Arial"\);/);
  });

  it("maps the theme fonts to those variables with sans and monospace fallbacks", () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\),[^;]*\bsans-serif;/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-geist-mono\),[^;]*\bmonospace;/);
    expect(css).toMatch(/html\s*\{[^}]*font-sans/);
  });
});
