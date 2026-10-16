import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Site settings keep what belongs to the site. API keys live in /settings.

const { auth, db, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  db: {
    site: { findUnique: vi.fn() },
    apiKey: { findUnique: vi.fn(), findMany: vi.fn() },
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ refresh: () => {} }) }));

const { default: SiteSettingsPage } = await import("./page");

async function render() {
  return renderToStaticMarkup(await SiteSettingsPage({ params: Promise.resolve({ siteId: "site-1" }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "user-1" } });
  db.site.findUnique.mockResolvedValue({
    userId: "user-1",
    domain: "quilltab.app",
    gscProperty: "sc-domain:quilltab.app",
    bingSite: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    _count: { keywords: 1, pages: 2, crawls: 3, vitals: 4, alerts: 5, savedKeywords: 6 },
  });
  db.apiKey.findUnique.mockResolvedValue(null);
});

describe("site settings", () => {
  it("renders no API key forms", async () => {
    db.apiKey.findUnique.mockResolvedValue({ id: "key-1" });
    const html = await render();
    // The Bing property picker keeps a hidden input for its value; nothing else takes input.
    expect(html).not.toMatch(/<input(?![^>]*-hidden-input)/);
    expect(html).not.toContain("<label");
    expect(html).not.toMatch(/External API keys|DataForSEO|PageSpeed|Save key/i);
    expect(html).toContain(">Site settings</h1>");
    expect(html).toContain("Site details");
    expect(html).toContain("Stored data");
    expect(html).toContain("Danger zone");
  });

  it("lists stored data as rows in one bordered list, not cards", async () => {
    const html = await render();
    const start = html.indexOf(">Stored data<");
    const list = html.slice(start, html.indexOf("Danger zone", start));
    expect(list).toMatch(/<ul class="[^"]*panel[^"]*divide-y/);
    const rows = [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, "|"));
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatch(/Keyword records\|+1/);
    expect(rows[5]).toMatch(/Saved keywords\|+6/);
    expect(list).not.toContain("rounded-lg border");
  });

  it("hides the Bing property picker without a Bing key and links to Settings", async () => {
    const html = await render();
    expect(html).not.toContain("Bing Webmaster property");
    expect(html).toContain("Connect Bing in Settings");
    expect(html).toContain('href="/settings?connect=bing#connections"');
  });

  it("shows the Bing property picker with a Bing key", async () => {
    db.apiKey.findUnique.mockResolvedValue({ id: "key-1" });
    const html = await render();
    expect(html).toContain("Bing Webmaster property");
    expect(html).not.toContain("Connect Bing in Settings");
    expect(db.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_provider: { userId: "user-1", provider: "bing" } } })
    );
  });
});
