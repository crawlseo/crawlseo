// Builds dist/cli.js, the package's only file: src/ bundled into one ES
// module. The MCP SDK and zod stay dependencies. Run from the repository
// (npm ci at the root first): esbuild comes from the root node_modules.
import { chmodSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const outfile = process.argv[2] ?? join(here, "dist/cli.js");

await build({
  entryPoints: [join(here, "src/cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
});
chmodSync(outfile, 0o755);
