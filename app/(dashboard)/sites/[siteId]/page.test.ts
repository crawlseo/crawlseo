import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Search Console anonymises the query dimension on low-traffic properties, so
// a sync can legitimately store pages and zero keywords. The overview used to
// gate on keywords alone and told such sites to "run a sync" forever.

const counts = vi.hoisted(() => ({ keywords: 0, pages: 0 }));
type Activity = {
  active: { id: string } | null;
  failed: { id: string; error: string | null; finishedAt: Date | null } | null;
};
const activity = vi.hoisted<Activity>(() => ({ active: null, failed: null }));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({
  db: {
    site: {
      findUnique: async () => ({
        userId: "user-1",
        domain: "a.example",
        gscProperty: "https://a.example/",
        _count: counts,
      }),
    },
    crawl: { findFirst: async () => null },
    vitalsReport: { findFirst: async () => null },
  },
}));
vi.mock("@/lib/crawler/lifecycle", () => ({ getCrawlActivity: async () => activity }));
vi.mock("@/lib/seo-opportunities", () => ({
  getAllOpportunities: async () => ({ feed: [] }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/sites/site-a",
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
// Async server components cannot go through renderToString; they are not
// what this test is about.
vi.mock("@/components/dashboard/metrics", () => ({ DashboardMetrics: () => null }));
vi.mock("@/components/dashboard/traffic-chart", () => ({ TrafficChart: () => null }));
vi.mock("@/components/dashboard/top-keywords", () => ({ TopKeywords: () => null }));

import SiteOverviewPage from "./page";

async function render(next: typeof counts): Promise<string> {
  Object.assign(counts, next);
  const tree = await SiteOverviewPage({ params: Promise.resolve({ siteId: "site-a" }) });
  return renderToString(tree);
}

describe("site overview empty state", () => {
  it("shows the empty state before any sync", async () => {
    const html = await render({ keywords: 0, pages: 0 });
    expect(html).toContain("Waiting for GSC data");
    expect(html).not.toContain("Crawl health");
  });

  it("renders the overview when the sync stored pages but no keywords", async () => {
    const html = await render({ keywords: 0, pages: 27 });
    expect(html).not.toContain("Waiting for GSC data");
    expect(html).toContain("Crawl health");
  });

  it("renders the overview when the sync stored keywords", async () => {
    const html = await render({ keywords: 5, pages: 3 });
    expect(html).toContain("Crawl health");
  });
});

describe("site overview crawl status (#57)", () => {
  afterEach(() => {
    Object.assign(activity, { active: null, failed: null });
  });

  it("shows a failed last crawl with its message", async () => {
    activity.failed = {
      id: "c1",
      error: "Interrupted: the server restarted or the crawl stopped responding",
      finishedAt: new Date("2026-10-06T09:00:00Z"),
    };
    const html = await render({ keywords: 5, pages: 3 });
    expect(html).toContain("Last crawl");
    expect(html).toContain("Failed");
    expect(html).toContain("Interrupted: the server restarted or the crawl stopped responding");
  });

  it("shows a crawl in progress", async () => {
    activity.active = { id: "c2" };
    const html = await render({ keywords: 5, pages: 3 });
    expect(html).toContain("Running");
    expect(html).not.toContain("Failed");
  });
});
