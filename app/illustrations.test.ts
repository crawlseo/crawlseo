import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";
import { EMPTY_ILLUSTRATION_DIR, illustrationSrc } from "@/components/ui/empty-state";

// Empty-state illustrations are static files in public/, so a typo in a name is a broken image at runtime
// and nothing else catches it. Every `illustration` value in app/ and components/ must be a string literal
// that resolves to a file in public/illustrations/empty/.

const root = resolve(__dirname, "..");
const publicDir = join(root, "public");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith(".tsx") && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

const usages = [...tsxFiles(join(root, "app")), ...tsxFiles(join(root, "components"))].flatMap((file) => {
  const source = readFileSync(file, "utf8");
  const props = source.match(/\billustration=/g) ?? [];
  const literals = [...source.matchAll(/\billustration=(?:"([^"]+)"|\{"([^"]+)"\})/g)].map((m) => m[1] ?? m[2]);
  return props.map((_, i) => ({ file: relative(root, file), value: literals[i] }));
});

describe("empty-state illustrations", () => {
  it("resolves names and paths", () => {
    expect(illustrationSrc("empty-sites")).toBe(`${EMPTY_ILLUSTRATION_DIR}/empty-sites.svg`);
    expect(illustrationSrc("empty-sites.svg")).toBe(`${EMPTY_ILLUSTRATION_DIR}/empty-sites.svg`);
    expect(illustrationSrc("/illustrations/empty/empty-crawl.svg")).toBe("/illustrations/empty/empty-crawl.svg");
  });

  it("is used in the app", () => {
    expect(usages.length).toBeGreaterThan(0);
  });

  it("uses string literals that exist in public/illustrations/empty/", () => {
    const broken = usages
      .filter(({ value }) => !value || !existsSync(join(publicDir, illustrationSrc(value))))
      .map(({ file, value }) => `${file}: ${value ?? "(not a string literal)"}`);
    expect(broken).toEqual([]);
  });

  it("ships no GEO illustrations in the open-source repo", () => {
    const files = readdirSync(join(publicDir, EMPTY_ILLUSTRATION_DIR));
    expect(files.filter((name) => /geo/i.test(name))).toEqual([]);
  });
});
