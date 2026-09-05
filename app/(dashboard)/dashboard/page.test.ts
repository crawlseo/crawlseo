import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Search Console anonymises the query dimension on low-traffic properties, so
// a sync can legitimately store pages and zero keywords. The portfolio
// dashboard used to treat "no keywords" as "no sync yet": the onboarding
// checklist kept demanding a first sync and the site card hid its metrics
// behind "Waiting for first GSC sync…" — even though the Page model (the
// source for those metrics, see lib/seo-metrics.ts) already has data.

const counts = vi.hoisted(() => ({ keywords: 0, pages: 0, crawls: 0 }));

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({
  db: {
    site: {
      findMany: async () => [
        {
          id: "site-a",
          domain: "a.example",
          gscProperty: "https://a.example/",
          _count: counts,
        },
      ],
    },
  },
}));
vi.mock("@/lib/seo-metrics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/seo-metrics")>();
  return {
    ...actual,
    getSitePeriodMetrics: async () => ({
      current: { clicks: 120, impressions: 4800, avgPosition: 9.2, avgCtr: 0.025, uniqueKeywords: 0 },
      previous: { clicks: 90, impressions: 4000, avgPosition: 11.4, avgCtr: 0.0225, uniqueKeywords: 0 },
      deltas: { clicks: 33.3, impressions: 20, avgPosition: 2.2, avgCtr: 11.1 },
    }),
  };
});
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
// Client components under test (the dashboard is what we render, but these
// children pull in browser-only hooks / modals we do not want in a node test).
vi.mock("@/components/sites/add-site-modal", () => ({ AddSiteModal: () => null }));
vi.mock("@/components/ui/data-lag-badge", () => ({ DataLagBadge: () => null }));

import DashboardPage from "./page";

async function render(next: typeof counts): Promise<string> {
  Object.assign(counts, next);
  const tree = await DashboardPage();
  return renderToString(tree);
}

describe("portfolio dashboard keyword-vs-page gates", () => {
  it("treats a site with pages but no keywords as synced and shows its metrics", async () => {
    const html = await render({ keywords: 0, pages: 27, crawls: 1 });
    // The card must NOT hide the site behind the waiting state.
    expect(html).not.toContain("Waiting for first GSC sync");
    // The onboarding checklist must no longer nag for a first sync.
    expect(html).not.toContain("Sync GSC data");
    // Metrics derived from the Page model are shown.
    expect(html).toContain("Clicks");
    expect(html).toContain("Impressions");
  });

  it("still shows the waiting state before any sync at all", async () => {
    const html = await render({ keywords: 0, pages: 0, crawls: 0 });
    expect(html).toContain("Waiting for first GSC sync");
    expect(html).toContain("Sync GSC data");
  });

  it("treats a site with keywords as synced", async () => {
    const html = await render({ keywords: 5, pages: 3, crawls: 1 });
    expect(html).not.toContain("Waiting for first GSC sync");
    expect(html).not.toContain("Sync GSC data");
  });
});
