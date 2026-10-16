import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";
import { EMPTY_ILLUSTRATION_DIR, illustrationSrc } from "@/components/ui/empty-state";

// Empty-state illustrations are static files in public/, so a typo in a name is a broken image at runtime
// and nothing else catches it. Every `illustration` value in app/ and components/ (JSX prop or object
// property) must be a string literal naming a file in public/illustrations/empty/, matched case-sensitively
// as on the Linux image. EmptyState takes no spread props, so no value can bypass the scan.

const root = resolve(__dirname, "..");
const publicDir = join(root, "public");
const illustrationFiles = new Set(readdirSync(join(publicDir, EMPTY_ILLUSTRATION_DIR)));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const sources = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "components"))].map((file) => ({
  file: relative(root, file),
  source: readFileSync(file, "utf8"),
}));

const usages = sources.flatMap(({ file, source }) => {
  const props = source.match(/\billustration=/g) ?? [];
  const literals = [...source.matchAll(/\billustration=(?:"([^"]+)"|\{"([^"]+)"\})/g)].map((m) => m[1] ?? m[2]);
  const properties = [...source.matchAll(/\billustration\??:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  return [...props.map((_, i) => literals[i]), ...properties].map((value) => ({ file, value }));
});

/** The file in public/illustrations/empty/ a value points to, or undefined when it points anywhere else. */
function illustrationFile(value: string): string | undefined {
  const src = illustrationSrc(value);
  const prefix = `${EMPTY_ILLUSTRATION_DIR}/`;
  if (!src.startsWith(prefix)) return undefined;
  const name = src.slice(prefix.length);
  return illustrationFiles.has(name) ? name : undefined;
}

describe("empty-state illustrations", () => {
  it("resolves names and paths", () => {
    expect(illustrationSrc("empty-sites")).toBe(`${EMPTY_ILLUSTRATION_DIR}/empty-sites.svg`);
    expect(illustrationSrc("empty-sites.svg")).toBe(`${EMPTY_ILLUSTRATION_DIR}/empty-sites.svg`);
    expect(illustrationSrc("/illustrations/empty/empty-crawl.svg")).toBe("/illustrations/empty/empty-crawl.svg");
  });

  it("is used in the app", () => {
    expect(usages.length).toBeGreaterThan(0);
  });

  it("only accepts files inside public/illustrations/empty/, with exact case", () => {
    expect(illustrationFile("empty-sites")).toBe("empty-sites.svg");
    expect(illustrationFile("Empty-Sites")).toBeUndefined();
    expect(illustrationFile("/illustrations/empty")).toBeUndefined();
    expect(illustrationFile("/brand/crawlseo-icon-192.png")).toBeUndefined();
  });

  it("uses string literals that exist in public/illustrations/empty/", () => {
    const broken = usages
      .filter(({ value }) => !value || !illustrationFile(value))
      .map(({ file, value }) => `${file}: ${value ?? "(not a string literal)"}`);
    expect(broken).toEqual([]);
  });

  it("passes no spread props to EmptyState", () => {
    const spreads = sources.filter(({ source }) => /<EmptyState\b[^>]*\{\s*\.\.\./.test(source)).map(({ file }) => file);
    expect(spreads).toEqual([]);
  });

  it("ships no GEO illustrations in the open-source repo", () => {
    expect([...illustrationFiles].filter((name) => /geo/i.test(name))).toEqual([]);
  });
});
