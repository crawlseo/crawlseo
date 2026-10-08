import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

// Font guards and palette contrast. Browser behavior lives in e2e/appearance.e2e.ts.

const root = resolve(__dirname, "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");

/** Value of a custom property declared in globals.css, following var() references. */
function token(name: string): string {
  const match = css.match(new RegExp(`\\s${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`${name} is not declared`);
  const value = match[1].trim();
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? token(ref[1]) : value;
}

function luminance(hex: string): number {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function color(name: string, theme: number): string {
  const value = token(name);
  const pair = value.match(/^light-dark\((#[a-f0-9]+),\s*(#[a-f0-9]+)\)$/i);
  return pair ? pair[theme + 1] : value;
}

describe.each([0, 1])("palette %i", (theme) => {
  it.each([
    ["--text", "--background"],
    ["--text-strong", "--card"],
    ["--text-muted", "--card"],
    ["--text-muted", "--bg-section"],
    ["--success", "--success-bg"],
    ["--warning", "--warning-bg"],
    ["--danger", "--danger-bg"],
    ["--brand-700", "--card"],
  ])("keeps %s readable on %s", (foreground, background) => {
    const values = [
      luminance(color(foreground, theme)),
      luminance(color(background, theme)),
    ].sort((a, b) => a - b);
    expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("fonts", () => {
  it("puts both next/font variables on <html>", () => {
    expect(layout).toMatch(/Inter\(\{[^}]*variable:\s*"--font-inter"/);
    expect(layout).toMatch(
      /Geist_Mono\(\{[^}]*variable:\s*"--font-geist-mono"/,
    );
    expect(layout).toMatch(
      /<html[^>]*className=\{`\$\{inter\.variable\} \$\{geistMono\.variable\}/,
    );
  });

  it("maps the theme fonts to those variables with sans and monospace fallbacks", () => {
    expect(css).toMatch(
      /--font-sans:\s*var\(--font-inter\),[^;]*\bsans-serif;/,
    );
    expect(css).toMatch(
      /--font-mono:\s*var\(--font-geist-mono\),[^;]*\bmonospace;/,
    );
    expect(css).toMatch(/html\s*\{[^}]*font-sans/);
  });
});
