import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
// The Google row's disconnect dialog posts to a server action; only its trigger renders here.
vi.mock("@/app/(dashboard)/settings/actions", () => ({
  deleteAccountAction: vi.fn(),
  disconnectGoogleAction: vi.fn(),
  signOutAction: vi.fn(),
}));

const { ConnectionsSection, savedTestMessage } = await import("./connections-section");
const { apiKeyStatus } = await import("@/lib/api-keys");

const NONE = {
  dataforseo: { connected: false },
  google_pagespeed: { connected: false },
  bing: { connected: false },
};
const GOOGLE = {
  connected: true,
  sealed: true,
  scopes: ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/webmasters.readonly"],
};

/** The markup of one provider's row. */
function row(html: string, provider: string): string {
  const start = html.indexOf(`data-provider="${provider}"`);
  expect(start, `row ${provider}`).toBeGreaterThan(-1);
  const end = html.indexOf("data-provider=", start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

const badge = (rowHtml: string) => (rowHtml.includes(">Not connected<") ? "NOT CONNECTED" : rowHtml.includes(">Connected<") ? "CONNECTED" : null);

describe("ConnectionsSection", () => {
  it("renders one row per provider with the status the API returns", async () => {
    // The same helper backs GET /api/user/api-keys and the Settings page.
    const db = {
      apiKey: {
        findMany: vi.fn(async () => [{ provider: "bing", updatedAt: new Date("2026-10-01T00:00:00Z") }]),
      },
    };
    const status = await apiKeyStatus(db as never, "user-1");
    expect(db.apiKey.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));

    const html = renderToStaticMarkup(<ConnectionsSection google={GOOGLE} initialStatus={status} />);
    expect([...html.matchAll(/data-provider="([a-z_]+)"/g)].map((m) => m[1])).toEqual([
      "google",
      "bing",
      "dataforseo",
      "google_pagespeed",
    ]);
    expect(badge(row(html, "google"))).toBe("CONNECTED");
    expect(badge(row(html, "bing"))).toBe("CONNECTED");
    expect(badge(row(html, "dataforseo"))).toBe("NOT CONNECTED");
    expect(badge(row(html, "google_pagespeed"))).toBe("NOT CONNECTED");

    // Connected rows offer Disconnect, the others Connect; no form is open.
    expect(row(html, "bing")).toContain(">Disconnect<");
    expect(row(html, "dataforseo")).toContain(">Connect<");
    expect(row(html, "google")).toContain(">Disconnect<");
    expect(html).not.toContain("<input");
  });

  it("offers Test connection for a saved key and Replace on every connected key row", () => {
    const saved = { connected: true, updatedAt: "2026-10-01T00:00:00.000Z" };
    const html = renderToStaticMarkup(
      <ConnectionsSection
        google={GOOGLE}
        initialStatus={{ bing: saved, dataforseo: saved, google_pagespeed: saved }}
      />
    );
    const labels = (provider: string) =>
      [...row(html, provider).matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    expect(labels("bing")).toEqual(["Test connection", "Replace", "Disconnect"]);
    expect(labels("dataforseo")).toEqual(["Test connection", "Replace", "Disconnect"]);
    // PageSpeed has no connection test.
    expect(labels("google_pagespeed")).toEqual(["Replace", "Disconnect"]);
  });

  it("shows Google's access as labels and keeps the scope URLs behind Details", () => {
    const html = renderToStaticMarkup(<ConnectionsSection google={GOOGLE} initialStatus={NONE} />);
    const google = row(html, "google");
    expect(google).toContain("Sign-in, Email address, Search Console, read-only");
    expect(google).toContain(">Details");
    expect(google).toContain('aria-expanded="false"');
    expect(google).not.toContain("https://www.googleapis.com/auth/");
  });

  it("offers Connect for Google when no tokens are stored", () => {
    const html = renderToStaticMarkup(
      <ConnectionsSection google={{ connected: false, sealed: true, scopes: [] }} initialStatus={NONE} />
    );
    const google = row(html, "google");
    expect(badge(google)).toBe("NOT CONNECTED");
    expect(google).toContain(">Connect<");
    expect(google).not.toContain(">Details");
  });

  it("does not call Google connected when Search Console access was not granted", () => {
    const html = renderToStaticMarkup(
      <ConnectionsSection
        google={{ connected: true, sealed: true, scopes: ["openid", "https://www.googleapis.com/auth/userinfo.email"] }}
        initialStatus={NONE}
      />
    );
    const google = row(html, "google");
    expect(badge(google)).toBe("NOT CONNECTED");
    expect(google).toContain("Search Console access was not granted");
    expect(google).toContain(">Connect<");
    expect(google).toContain(">Disconnect<");
  });

  it("expands the Bing form with help text and a link, never a placeholder", () => {
    const html = renderToStaticMarkup(
      <ConnectionsSection google={GOOGLE} initialStatus={NONE} initialOpen="bing" />
    );
    const bing = row(html, "bing");
    expect(bing).toContain("<form");
    expect(bing).toContain(">API key</label>");
    expect(bing).toContain("Settings, API access, then Generate API key");
    expect(bing).toContain('href="https://www.bing.com/webmasters"');
    expect(html).not.toContain("placeholder=");
    // Only the requested row is open.
    expect(row(html, "dataforseo")).not.toContain("<form");
  });

  it("does not open the form of a provider that is already connected", () => {
    const html = renderToStaticMarkup(
      <ConnectionsSection
        google={GOOGLE}
        initialStatus={{ ...NONE, bing: { connected: true, updatedAt: "2026-10-01T00:00:00.000Z" } }}
        initialOpen="bing"
      />
    );
    expect(html).not.toContain("<form");
  });

  it("uses mono uppercase buttons with one primary, enabled while the form is empty", () => {
    const html = renderToStaticMarkup(
      <ConnectionsSection google={GOOGLE} initialStatus={NONE} initialOpen="dataforseo" />
    );
    const form = row(html, "dataforseo").slice(row(html, "dataforseo").indexOf("<form"));
    const buttons = [...form.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
      attrs: m[1],
      label: m[2].replace(/<[^>]+>/g, ""),
    }));
    expect(buttons.map((b) => b.label)).toEqual(["Save", "Test connection", "Cancel"]);
    expect(buttons.every((b) => b.attrs.includes("mono-button"))).toBe(true);
    expect(buttons.filter((b) => b.attrs.includes("bg-button-primary"))).toHaveLength(1);
    expect(buttons[0].attrs).toContain('type="submit"');
    expect(buttons[0].attrs).not.toMatch(/\sdisabled=""/);
  });

  it("caps the key form at 560 px: labels, fields and messages, not the row", () => {
    const html = renderToStaticMarkup(
      <ConnectionsSection google={GOOGLE} initialStatus={NONE} initialOpen="dataforseo" />
    );
    const cap = html.indexOf("max-w-[560px]");
    expect(cap).toBeGreaterThan(-1);
    const capped = html.slice(cap, html.indexOf("mt-4 flex flex-wrap", cap));
    expect(capped.match(/<input/g)).toHaveLength(2);
    expect(capped.match(/<label/g)).toHaveLength(2);
    expect(capped).not.toContain("<button");
    expect(html).not.toMatch(/<li[^>]*max-w-\[560px\]/);
  });

  it("puts focus back on Replace or Connect, and words saved-test results for people", () => {
    const html = renderToStaticMarkup(
      <ConnectionsSection
        google={GOOGLE}
        initialStatus={{ ...NONE, bing: { connected: true, updatedAt: "2026-10-01T00:00:00.000Z" } }}
      />
    );
    expect(row(html, "bing")).toMatch(/data-return-focus=""[^>]*>Replace</);
    expect(row(html, "dataforseo")).toMatch(/data-return-focus=""[^>]*>Connect</);
    expect(savedTestMessage(200, true)).toEqual({ ok: true, text: "The saved key works." });
    expect(savedTestMessage(401, undefined).text).toMatch(/Sign in again/);
    expect(savedTestMessage(404, undefined).text).toMatch(/No key is saved/);
    expect(savedTestMessage(200, false).text).toMatch(/did not accept/);
    expect(savedTestMessage(500, undefined).text).toMatch(/could not run/);
  });
});
