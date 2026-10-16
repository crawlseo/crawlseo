import { readFileSync } from "fs";
import { resolve } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Sidebar footer: the user button (avatar, name) and the app version under it.

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock("@/app/(dashboard)/settings/actions", () => ({ signOutAction: vi.fn() }));

const { AppShell } = await import("./app-shell");
const { APP_VERSION } = await import("@/lib/version");

function render(props: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  update?: { version: string; url: string } | null;
}) {
  return renderToStaticMarkup(
    <AppShell {...props} version={APP_VERSION} sites={[]} showCloudPromo={false}>
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
    expect(html).toContain(">Update available: v9.0.0</a>");

    expect(render({ name: "Mike" })).not.toContain("Update available");
    expect(render({ name: "Mike", update: null })).not.toContain("Update available");
  });
});
