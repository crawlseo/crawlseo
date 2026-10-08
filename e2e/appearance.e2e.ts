import { expect, test } from "@playwright/test";

// /login is public and uses the same appearance cookie and tokens as the dashboard.

test.use({ colorScheme: "dark" });

test("the default remains light even with a dark OS setting", async ({
  page,
}) => {
  await page.goto("/login");
  const { background, scheme, htmlClass } = await page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    htmlClass: document.documentElement.className,
  }));
  // --background is --bg, #FFFFFF
  expect(background).toBe("rgb(255, 255, 255)");
  expect(scheme).toBe("light");
  expect(htmlClass).not.toMatch(/\bdark\b/);
});

test("body text is Inter and mono labels are Geist Mono", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => document.fonts.ready);

  const bodyFont = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  );
  expect(bodyFont).toMatch(/^"?Inter"?,/);
  expect(bodyFont).toMatch(/sans-serif$/);

  // The sign-in button label uses mono-button; a mono-label span uses the same family.
  const buttonFont = await page
    .getByRole("button", { name: "Continue with Google" })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(buttonFont).toMatch(/^"?Geist Mono"?,/);

  const labelFont = await page.evaluate(() => {
    const span = document.createElement("span");
    span.className = "mono-label";
    span.textContent = "Label";
    document.body.append(span);
    const family = getComputedStyle(span).fontFamily;
    span.remove();
    return family;
  });
  expect(labelFont).toMatch(/^"?Geist Mono"?,/);
  expect(labelFont).toMatch(/monospace$/);

  // The fonts actually loaded, not just named.
  const loaded = await page.evaluate(() => ({
    inter: document.fonts.check('16px "Inter"'),
    mono: document.fonts.check('12px "Geist Mono"'),
  }));
  expect(loaded).toEqual({ inter: true, mono: true });
});

test("explicit dark mode survives reloads and overrides a light OS setting", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "crawlseo-theme", value: "dark", url: baseURL! },
  ]);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(18, 21, 24)",
  );
  await page.reload();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(18, 21, 24)",
  );
});

test("system mode follows OS changes without reloading", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "crawlseo-theme", value: "system", url: baseURL! },
  ]);
  await page.goto("/login");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(18, 21, 24)",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
});
