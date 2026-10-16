import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

// The app may contact only the hosts in the README "Your data stays yours"
// table. This fails when a new external host shows up in the app's code
// without being added to outbound-hosts.json (and so to the README), and when
// a host listed as "not requested" (a link) shows up in another file.

const ROOT = resolve(__dirname, "..");
const DIRS = ["lib", "app", "mcp", "components"];
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const allowlist = JSON.parse(readFileSync(join(ROOT, "outbound-hosts.json"), "utf8")) as {
  requests: Record<string, string>;
  notRequested: Record<string, { reason: string; files: string[] }>;
};

/** Reserved example names (RFC 2606, RFC 6761) and private or local addresses. */
function isExampleOrLocal(host: string): boolean {
  return (
    /(^|\.)example\.(com|org|net)$/.test(host) ||
    /\.(example|test|invalid|localhost|local|internal)$/.test(host) ||
    host === "localhost" ||
    /^(127|10)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) ||
    host === "0.0.0.0"
  );
}

/** Hosts in URLs (http, https, ws, wss) and in `host:` / `hostname:` options. */
function externalHosts(source: string): string[] {
  const hosts = new Set<string>();
  const patterns = [
    /\b(?:https?|wss?):\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi,
    /\bhost(?:name)?\s*:\s*["'`]([a-z0-9-]+(?:\.[a-z0-9-]+)+)["'`]/gi,
  ];
  for (const pattern of patterns) {
    for (const m of source.matchAll(pattern)) {
      const host = m[1].toLowerCase();
      if (!isExampleOrLocal(host)) hosts.add(host);
    }
  }
  return [...hosts];
}

function isTestFile(path: string): boolean {
  return /\.test\.(ts|tsx)$/.test(path) || path.startsWith("lib/testing/") || path.endsWith(".d.ts");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return dir && entry.name !== "node_modules" ? sourceFiles(path) : [];
    return CODE.test(entry.name) && !isTestFile(path) ? [path] : [];
  });
}

/** Code in the scanned folders and at the repository root (next.config.ts, instrumentation.ts). */
function allSourceFiles(): string[] {
  return [...sourceFiles(""), ...DIRS.flatMap((dir) => sourceFiles(dir))];
}

describe("outbound hosts", () => {
  it("every external host in the code is on the allowlist, links only in their files", () => {
    const files = allSourceFiles();
    expect(files).toContain("instrumentation.ts");
    expect(files).toContain("lib/update-check.ts");
    expect(files).toContain("components/layout/cloud-promo.tsx");

    const problems: string[] = [];
    for (const file of files) {
      for (const host of externalHosts(readFileSync(join(ROOT, file), "utf8"))) {
        if (host in allowlist.requests) continue;
        const link = allowlist.notRequested[host];
        if (!link) problems.push(`${host} in ${file}: not on the allowlist`);
        else if (!link.files.includes(file)) problems.push(`${host} in ${file}: listed as a link only for ${link.files.join(", ")}`);
      }
    }
    expect(problems).toEqual([]);
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
    expect(externalHosts('new WebSocket("wss://events.vendor.io/s")')).toEqual(["events.vendor.io"]);
    expect(externalHosts('https.request({ hostname: "t.vendor.io" })')).toEqual(["t.vendor.io"]);
    expect(externalHosts('fetch("http://203.0.113.9/collect")')).toEqual(["203.0.113.9"]);
    expect(externalHosts("http://192.168.1.2 http://172.20.0.1 http://169.254.169.254 http://127.0.0.1")).toEqual([]);
  });
});
