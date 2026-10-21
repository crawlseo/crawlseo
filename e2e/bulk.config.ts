import { defineConfig } from "@playwright/test";

// A real browser and the actual dialog, with a local API fixture. No OAuth,
// external provider credentials, database or development app is needed.
export default defineConfig({
  testDir: ".",
  testMatch: "bulk-actions.e2e.ts",
  workers: 1,
  timeout: 30_000,
  use: { channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
});
