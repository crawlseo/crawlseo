import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

// Static guards for "light only" and the two brand fonts. The browser check
// (dark mode emulated, computed styles) lives in e2e/light-only.e2e.ts.

const root = resolve(__dirname, "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");

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
  it("puts both next/font variables on <html>", () => {
    expect(layout).toMatch(/Inter\(\{[^}]*variable:\s*"--font-inter"/);
    expect(layout).toMatch(/Geist_Mono\(\{[^}]*variable:\s*"--font-geist-mono"/);
    expect(layout).toMatch(/<html[^>]*className=\{`\$\{inter\.variable\} \$\{geistMono\.variable\}/);
  });

  it("maps the theme fonts to those variables with sans and monospace fallbacks", () => {
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\),[^;]*\bsans-serif;/);
    expect(css).toMatch(/--font-mono:\s*var\(--font-geist-mono\),[^;]*\bmonospace;/);
    expect(css).toMatch(/html\s*\{[^}]*font-sans/);
  });
});
