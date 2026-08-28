import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Base UI's Select.Value renders the raw value on first paint (popup not yet
// mounted) unless the Root receives `items`. These tests render the closed
// trigger the way the server does, which is exactly where the id/label bug
// showed up.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/sites/site-b/keywords",
}));

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

let SiteSwitcher: typeof import("./site-switcher").SiteSwitcher;
let CrawlButton: typeof import("./action-buttons").CrawlButton;

beforeAll(async () => {
  ({ SiteSwitcher } = await import("./site-switcher"));
  ({ CrawlButton } = await import("./action-buttons"));
});

function triggerText(html: string): string {
  const match = html.match(/data-slot="select-trigger"[^>]*>([\s\S]*?)<\/button>/);
  return match ? match[1].replace(/<[^>]+>/g, "") : "";
}

describe("Select triggers show labels, not raw values", () => {
  const sites = [
    { id: "site-a", domain: "a.example" },
    { id: "site-b", domain: "b.example" },
  ];

  it("site switcher shows the domain of the site in the path", () => {
    const html = renderToString(createElement(SiteSwitcher, { sites }));
    expect(triggerText(html)).toContain("b.example");
    expect(triggerText(html)).not.toContain("site-b");
  });

  it("crawl page-limit select shows the label of the default preset", () => {
    const html = renderToString(createElement(CrawlButton, { siteId: "site-b" }));
    expect(triggerText(html)).toContain("200 pages");
  });
});
