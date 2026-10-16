import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

// The app may contact only the hosts in the README "Your data stays yours"
// table. This fails when a new external host shows up in lib/, app/ or mcp/
// without being added to outbound-hosts.json (and so to the README).

const ROOT = resolve(__dirname, "..");
const DIRS = ["lib", "app", "mcp"];
const allowlist = JSON.parse(readFileSync(join(ROOT, "outbound-hosts.json"), "utf8")) as {
  requests: Record<string, string>;
  notRequested: Record<string, string>;
};

/** Reserved example names (RFC 2606, RFC 6761), local addresses and XML namespaces. */
function isExampleOrLocal(host: string): boolean {
  return (
    /(^|\.)example\.(com|org|net)$/.test(host) ||
    /\.(example|test|invalid|localhost|local|internal)$/.test(host) ||
    host === "localhost" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host === "www.w3.org"
  );
}

function externalHosts(source: string): string[] {
  const hosts = new Set<string>();
  for (const m of source.matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
    const host = m[1].toLowerCase();
    if (!isExampleOrLocal(host)) hosts.add(host);
  }
  return [...hosts];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "testing" || entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("outbound hosts", () => {
  it("every external host in lib/, app/ and mcp/ is on the allowlist", () => {
    const allowed = new Set([...Object.keys(allowlist.requests), ...Object.keys(allowlist.notRequested)]);
    const unknown: string[] = [];
    for (const dir of DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        for (const host of externalHosts(readFileSync(file, "utf8"))) {
          if (!allowed.has(host)) unknown.push(`${host} in ${file.slice(ROOT.length + 1)}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("every host the app requests is named in the README section", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const start = readme.indexOf("## Your data stays yours");
    expect(start).toBeGreaterThan(-1);
    const section = readme.slice(start, readme.indexOf("\n## ", start + 1));
    for (const host of Object.keys(allowlist.requests)) {
      expect(section, host).toContain(`\`${host}\``);
    }
    expect(section).toContain("CRAWLSEO_UPDATE_CHECK=false");
  });

  it("catches a new host and ignores example and local ones", () => {
    expect(externalHosts('fetch("https://telemetry.vendor.io/v1/e")')).toEqual(["telemetry.vendor.io"]);
    expect(
      externalHosts("https://example.com https://www.example.com http://localhost:3000 https://a.example http://10.0.0.5 https://x.test")
    ).toEqual([]);
    expect(externalHosts("`https://${site.domain}`")).toEqual([]);
  });
});
