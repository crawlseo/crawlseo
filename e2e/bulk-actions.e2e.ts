import { test, expect, type Page } from "@playwright/test";
import { build } from "esbuild";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import type { BulkJobView } from "../lib/bulk/types";

let server: Server;
let origin: string;
test.beforeAll(async () => {
  const root = resolve(__dirname, "..");
  const bundled = await build({
    absWorkingDir: root, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    stdin: { loader: "tsx", resolveDir: root, contents: `
      import { createRoot } from "react-dom/client";
      import { BulkActionsProvider, BulkActionsButton } from "./components/sites/bulk-actions";
      const sites = [
        { id: "one", domain: "one.test", gscProperty: "sc-domain:one.test", bingSite: null },
        { id: "two", domain: "two.test", gscProperty: "sc-domain:two.test", bingSite: null },
      ];
      createRoot(document.getElementById("app")).render(
        <BulkActionsProvider sites={sites} pageCeiling={60}>
          <BulkActionsButton /><a href="/sites/one">Open website</a>
        </BulkActionsProvider>
      );` },
    plugins: [{ name: "framework-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^(next\/(navigation|link)|next-auth\/react)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
        loader: "tsx",
        contents: args.path === "next/link"
          ? 'export default function Link(props) { return <a {...props} />; }'
          : args.path === "next/navigation"
            ? 'const router = { refresh() {} }; export const useRouter = () => router;'
            : 'export function signIn() {}',
        resolveDir: root,
      }));
    } }],
  });
  const cssPath = resolve(root, "app/globals.css");
  const css = await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath });
  server = createServer((req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundled.outputFiles[0].text); }
    else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css.css); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>'); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve())); });

async function api(page: Page) {
  let job: BulkJobView | null = null;
  const starts: Array<{ siteIds: string[]; actions: string[]; maxPages: number; vitalsLimit: number }> = [];
  await page.route("**/api/user/bulk-jobs", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      starts.push(body);
      job = {
        id: "batch", status: "RUNNING", cancelRequested: false, createdAt: new Date().toISOString(), finishedAt: null,
        tasks: body.siteIds.map((siteId: string) => ({ siteId, domain: `${siteId}.test`, action: body.actions[0], status: "running" })),
      };
    } else if (route.request().method() === "PATCH" && job) {
      job = { ...job, status: "CANCELLED", cancelRequested: true, tasks: job.tasks.map((task) => ({ ...task, status: "cancelled" })) };
    }
    await route.fulfill({ status: route.request().method() === "POST" ? 202 : 200, json: { job } });
  });
  return starts;
}

test("selects sites and limits, warns about PageSpeed, and restores progress after navigation and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const starts = await api(page);
  await page.goto(origin);
  await page.getByRole("button", { name: "Bulk actions" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/Without a PageSpeed API key/)).toContainText("GOOGLE_PAGESPEED_KEY");
  await page.getByRole("checkbox", { name: /GSC sync/ }).uncheck();
  await page.getByRole("checkbox", { name: /Crawl \/ Audit/ }).check();
  await page.getByRole("checkbox", { name: /^PageSpeed/ }).check();
  await expect(page.getByLabel("Crawl pages per website").locator("option")).toHaveText(["25 pages", "50 pages", "60 pages"]);
  await page.getByLabel("Crawl pages per website").selectOption("50");
  await page.getByLabel("PageSpeed pages per website").selectOption("3");
  await page.getByText("Choose websites (2 selected)").click();
  await page.getByRole("checkbox", { name: "two.test", exact: true }).uncheck();
  await page.getByRole("button", { name: "Start batch" }).click();
  await expect(page.getByRole("button", { name: "Stop queue" })).toBeVisible();
  expect(starts).toEqual([{ siteIds: ["one"], actions: ["crawl", "vitals"], maxPages: 50, vitalsLimit: 3 }]);
  await expect(page.getByRole("link", { name: "Manage API keys" })).toHaveAttribute("href", "/settings#connections");
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("link", { name: "Open website" }).click();
  await expect(page.getByRole("button", { name: "Updating 0/1" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Updating 0/1" }).click();
  await expect(page.getByText("0/1 steps finished · 0 with errors")).toBeVisible();
  await page.getByRole("button", { name: "Stop queue" }).click();
  await expect(page.getByRole("status")).toHaveText("Batch stopped");
  await page.getByRole("button", { name: "New batch" }).click();
  await expect(page.getByRole("button", { name: "Start batch" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the dialog fits a mobile viewport and does not allow an empty selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await api(page);
  await page.goto(origin);
  await page.getByRole("button", { name: "Bulk actions" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.getByRole("checkbox", { name: "All websites (2)" }).uncheck();
  await expect(page.getByRole("button", { name: "Start batch" })).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("bulk-actions-mobile.png") });
});

test("shows a server error without losing the selection", async ({ page }) => {
  await api(page);
  await page.route("**/api/user/bulk-jobs", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 503, json: { error: "Bulk actions require a long-running server." } });
  });
  await page.goto(origin);
  await page.getByRole("button", { name: "Bulk actions" }).click();
  await page.getByRole("button", { name: "Start batch" }).click();
  await expect(page.getByRole("alert")).toHaveText("Bulk actions require a long-running server.");
  await expect(page.getByRole("checkbox", { name: /GSC sync/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Start batch" })).toBeEnabled();
});
