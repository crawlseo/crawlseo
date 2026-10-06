import { defineConfig } from "@playwright/test";

// Browser checks that need real CSS: `npm run test:e2e`.
// Starts `next dev` on port 3210 with placeholder env (only public pages are
// visited, so no database or Google credentials are needed), or tests an
// already running app when E2E_BASE_URL is set.
// PLAYWRIGHT_CHANNEL=chrome uses the installed Chrome instead of `npx playwright install chromium`.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3210";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 120_000,
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3210",
        url: `${baseURL}/login`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
          NEXTAUTH_SECRET: "e2e-placeholder-secret",
          NEXTAUTH_URL: baseURL,
          AUTH_TRUST_HOST: "true",
          GOOGLE_CLIENT_ID: "placeholder",
          GOOGLE_CLIENT_SECRET: "placeholder",
        },
      },
});
