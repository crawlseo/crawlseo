import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RobotsReport } from "@/lib/crawler/robots";
import { RobotsPanel } from "./robots-panel";

const empty: RobotsReport = { skipped: 0, disallowed: 0, samples: [], origins: [], stopMessage: null };

describe("RobotsPanel", () => {
  it("renders nothing when robots.txt kept the crawler from nothing", () => {
    const html = renderToStaticMarkup(
      <RobotsPanel
        report={{
          ...empty,
          origins: [{ origin: "https://example.com", outcome: "rules", robotsStatus: 200, crawlDelay: null, skipped: 0, message: null }],
        }}
      />
    );
    expect(html).toBe("");
  });

  it("shows the skipped count as information and lists each skipped origin with its status", () => {
    const html = renderToStaticMarkup(
      <RobotsPanel
        report={{
          skipped: 5,
          disallowed: 3,
          samples: [{ url: "https://example.com/old", redirectedTo: "https://example.com/private/new" }],
          origins: [
            { origin: "https://example.com", outcome: "rules", robotsStatus: 200, crawlDelay: null, skipped: 3, message: null },
            {
              origin: "https://www.example.com",
              outcome: "unreachable",
              robotsStatus: 503,
              crawlDelay: null,
              skipped: 2,
              message: "robots.txt unreachable (503), host skipped",
            },
          ],
          stopMessage: null,
        }}
      />
    );
    expect(html).toContain("Information, not issues");
    expect(html).toContain("5 URLs");
    expect(html).toContain("https://www.example.com");
    expect(html).toContain("robots.txt unreachable (503), host skipped · 2 URLs skipped");
    expect(html).toContain("redirects to https://example.com/private/new");
    expect(html).not.toMatch(/danger|warning|critical/i);
  });
});
