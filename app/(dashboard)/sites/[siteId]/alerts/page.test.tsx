import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Alerts are shown in the app and, when the user set them up in Settings, sent to their webhook and email.
// Delivery is per account, not per alert, so the page must not name the stored per-alert channel.

const { db } = vi.hoisted(() => ({
  db: {
    site: { findUnique: vi.fn(async () => ({ userId: "user-1", domain: "quilltab.app" })) },
    alert: {
      findMany: vi.fn(async () => [
        { id: "a1", type: "traffic_drop", channel: "email", enabled: true, lastFired: null, config: { threshold: 20 } },
      ]),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "user-1" } })) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/alerts/evaluate", () => ({ ensureDefaultAlerts: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: () => {} }) }));

const { default: AlertsPage } = await import("./page");

describe("alerts page", () => {
  it("points to the webhook and email settings, and names no per-alert channel", async () => {
    const html = renderToStaticMarkup(await AlertsPage({ params: Promise.resolve({ siteId: "site-1" }) }));
    expect(html).toContain("traffic drop");
    expect(html).toContain("Never fired");
    expect(html).not.toMatch(/channel/i);
    expect(html).toContain('href="/settings#webhook"');
    expect(html).toContain('href="/settings#email"');
  });
});
