import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Sidebar footer: the user button (avatar, name) and the app version under it.

const nav = vi.hoisted(() => ({ pathname: "/sites" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("@/app/(dashboard)/settings/actions", () => ({ signOutAction: vi.fn() }));

const { AppShell } = await import("./app-shell");
const { APP_VERSION } = await import("@/lib/version");
const { SiteSwitcher } = await import("@/components/sites/site-switcher");
const { SITE_SUB_PAGES } = await import("@/lib/site-routes");

const SITES = [
  { id: "site-a", domain: "Alpha.example", dataThrough: null },
  { id: "site-b", domain: "beta.example", dataThrough: null },
];

function render(props: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  update?: { version: string; url: string } | null;
  sites?: typeof SITES;
}) {
  return renderToStaticMarkup(
    <AppShell {...props} version={APP_VERSION} sites={props.sites ?? []} showCloudPromo={false}>
      <p>page</p>
    </AppShell>
  );
}

describe("sidebar footer", () => {
  it("shows the package.json version in mono", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
    const html = render({ name: "Mike Gafin", email: "mike@quilltab.app" });
    expect(html).toMatch(new RegExp(`class="font-data[^"]*"[^>]*>v${pkg.version.replaceAll(".", "\\.")}<`));
  });

  it("shows the name with initials, and the email when there is no name", () => {
    const named = render({ name: "Mike Gafin", email: "mike@quilltab.app" });
    expect(named).toContain(">Mike Gafin<");
    expect(named).toContain(">MG<");

    const unnamed = render({ name: null, email: "mike@quilltab.app" });
    expect(unnamed).toContain(">mike@quilltab.app<");
    expect(unnamed).toContain(">MI<");
  });

  it("shows the Google picture when there is one", () => {
    const html = render({ name: "Mike", email: "mike@quilltab.app", image: "https://lh3.googleusercontent.com/a/x" });
    expect(html).toContain('src="https://lh3.googleusercontent.com/a/x"');
    expect(html).toContain('referrerPolicy="no-referrer"');
  });

  it("has no Account or Log out links any more", () => {
    const html = render({ name: "Mike", email: "mike@quilltab.app" });
    expect(html).not.toContain('href="/account"');
    expect(html).not.toContain("Log out");
  });

  it("links a newer release next to the version, and shows nothing without one", () => {
    const url = "https://github.com/crawlseo/crawlseo/releases/tag/v9.0.0";
    const html = render({ name: "Mike", update: { version: "9.0.0", url } });
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('>Update available: v9.0.0<span class="sr-only"> (opens in a new tab)</span></a>');

    expect(render({ name: "Mike" })).not.toContain("Update available");
    expect(render({ name: "Mike", update: null })).not.toContain("Update available");
  });
});

describe("sidebar home and workspace switcher", () => {
  it("has no Dashboard or Sites items and the logo leads to All sites", () => {
    nav.pathname = "/sites";
    const html = render({ name: "Mike", sites: SITES });
    expect(html).not.toContain("/dashboard");
    expect(html).not.toContain(">Dashboard<");
    expect(html).toMatch(/<a href="\/sites" aria-label="crawlseo"|<a aria-label="crawlseo"[^>]*href="\/sites"/);
  });

  it("shows All sites in the switcher and no site groups on the home", () => {
    nav.pathname = "/sites";
    const html = render({ name: "Mike", sites: SITES });
    expect(html).toContain('aria-label="Workspace: All sites"');
    expect(html).not.toContain(">Workspace<");
    expect(html).not.toContain(">Research<");
  });

  it("shows the switcher with no sites too, so Add site is always one click away", () => {
    nav.pathname = "/sites";
    expect(render({ name: "Mike" })).toContain('aria-label="Workspace: All sites"');
  });

  it("shows the domain in its own case and the Workspace and Research groups on a site", () => {
    nav.pathname = "/sites/site-a/keywords";
    const html = render({ name: "Mike", sites: SITES });
    expect(html).toContain('aria-label="Workspace: Alpha.example"');
    expect(html).toContain(">Alpha.example<");
    expect(html).toContain(">Workspace<");
    expect(html).toContain(">Research<");
    expect(html).toContain('href="/sites/site-a/keywords"');
  });

  it("shows a compact square with the site's first letter when collapsed", () => {
    nav.pathname = "/sites/site-b";
    const html = renderToStaticMarkup(<SiteSwitcher sites={SITES} collapsed />);
    expect(html).toContain('aria-label="Workspace: beta.example"');
    expect(html).toContain('title="beta.example"');
    expect(html).toMatch(/size-10[^"]*"/);
    expect(html).toContain(">b</span>");
  });

  it("keeps every site route of this build when switching site", () => {
    const routes = readdirSync(resolve(__dirname, "../../app/(dashboard)/sites/[siteId]"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((r) => !(SITE_SUB_PAGES as readonly string[]).includes(r))).toEqual([]);
  });
});
