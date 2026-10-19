import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// /settings: profile, connections and danger zone on one page; /account sends you there.

const { auth, db, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  db: {
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
    userSettings: { findUnique: vi.fn() },
    job: { findFirst: vi.fn() },
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("./actions", () => ({
  deleteAccountAction: vi.fn(),
  disconnectGoogleAction: vi.fn(),
  signOutAction: vi.fn(),
}));

const { default: SettingsPage } = await import("./page");
const { default: AccountPage } = await import("../account/page");

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "user-1", email: "mike@quilltab.app" } });
  db.user.findUnique.mockResolvedValue({
    email: "mike@quilltab.app",
    name: "Mike Gafin",
    image: null,
    googleTokens: { accessToken: "enc:v1:x", refreshToken: "enc:v1:y", scope: "openid email" },
  });
  db.apiKey.findMany.mockResolvedValue([]);
  db.userSettings.findUnique.mockResolvedValue(null);
  db.job.findFirst.mockResolvedValue(null);
});

describe("/account", () => {
  it("redirects to /settings", () => {
    expect(() => AccountPage()).toThrow("REDIRECT /settings");
    expect(redirect).toHaveBeenCalledWith("/settings");
  });
});

describe("/settings", () => {
  it("shows profile, connections and danger zone", async () => {
    const html = await render();
    expect(html).toContain(">Profile</h2>");
    expect(html).toContain(">Connections</h2>");
    expect(html).toContain(">Danger zone</h2>");
    expect(html).toContain("Mike Gafin");
    expect(html).toContain("mike@quilltab.app");
    expect(html).toContain(">MG<");
    expect(html).toContain(">Delete account");
    expect(html).not.toContain("Not set");
  });

  it("shows the schedule with the server defaults and the webhook form", async () => {
    vi.stubEnv("SCHEDULE_CRAWL_DAYS", "14");
    vi.stubEnv("SCHEDULE_VITALS_DAYS", "0");
    try {
      db.userSettings.findUnique.mockResolvedValue({ crawlScheduleDays: 1, vitalsScheduleDays: null, webhookUrl: null, webhookSecret: null });
      const html = await render();
      expect(html).toContain(">Schedule</h2>");
      expect(html).toContain("Server default (every 2 weeks)");
      expect(html).toMatch(/<option value="1" selected="">Every day<\/option>/);
      expect(html).toContain("SCHEDULE_VITALS_DAYS=0");
      expect(html).toContain(">Alert webhook</h2>");
      expect(html).toContain("Send test");
      expect(html).toContain("Only public addresses are allowed.");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("says when webhooks are off on the server", async () => {
    vi.stubEnv("ALERT_WEBHOOKS_ENABLED", "false");
    try {
      const html = await render();
      expect(html).toContain("ALERT_WEBHOOKS_ENABLED=false");
      expect(html).not.toContain("Send test");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("opens the form named by ?connect=", async () => {
    expect(await render({ connect: "bing" })).toContain(">API key</label>");
    const html = await render({ connect: "nonsense" });
    const connections = html.slice(html.indexOf('id="connections"'), html.indexOf('id="schedule"'));
    expect(connections).toContain("Bing Webmaster Tools");
    expect(connections).not.toContain("</label>");
  });

  it("sends a signed-out visitor to /login", async () => {
    auth.mockResolvedValue(null);
    await expect(render()).rejects.toThrow("REDIRECT /login");
  });
});
