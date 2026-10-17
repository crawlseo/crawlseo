// Bundles the worker process (worker/main.ts) into one file, worker.cjs, for
// the Docker image: the Next standalone output has no TypeScript runtime.
// Prisma stays external; the image ships its client and engine in
// node_modules, next to server.js.
import { build } from "esbuild";

await build({
  entryPoints: ["worker/main.ts"],
  outfile: process.argv[2] ?? "dist/worker.cjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["@prisma/client", ".prisma/client"],
  logLevel: "info",
});
