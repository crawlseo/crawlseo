import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// #57: a crawl whose process died used to keep the "Crawl in progress" banner
// spinning forever. The page now shows it as failed, with the reason.

type Activity = {
  active: { id: string } | null;
  failed: { id: string; error: string | null; finishedAt: Date | null } | null;
};
const activity = vi.hoisted<Activity>(() => ({ active: null, failed: null }));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({
  db: {
    site: { findUnique: async () => ({ userId: "user-1", domain: "a.example" }) },
    crawl: { findFirst: async () => null },
    auditPage: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/crawler/lifecycle", () => ({ getCrawlActivity: async () => activity }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/sites/site-a/crawl",
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import CrawlPage from "./page";

async function render(): Promise<string> {
  const tree = await CrawlPage({ params: Promise.resolve({ siteId: "site-a" }) });
  return renderToString(tree);
}

describe("crawl page status (#57)", () => {
  afterEach(() => {
    Object.assign(activity, { active: null, failed: null });
  });

  it("shows an interrupted crawl as failed with the message, not in progress", async () => {
    activity.failed = {
      id: "stuck",
      error: "Interrupted: the server restarted or the crawl stopped responding",
      finishedAt: new Date("2026-10-06T09:00:00Z"),
    };
    const html = await render();
    expect(html).toContain("Last crawl failed");
    expect(html).toContain("6 Oct 09:00 UTC");
    expect(html).toContain("Interrupted: the server restarted or the crawl stopped responding");
    expect(html).not.toContain("Crawl in progress");
  });

  it("shows the progress banner while a crawl runs", async () => {
    activity.active = { id: "live" };
    const html = await render();
    expect(html).toContain("Crawl in progress");
    expect(html).not.toContain("Last crawl failed");
  });
});
