import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RobotsReport } from "@/lib/crawler/robots";
import { RobotsPanel } from "./robots-panel";

/** The text a reader sees, without markup. */
function text(html: string) {
  return html.replace(/<[^>]+>/g, "");
}

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
    expect(text(html)).toContain("https://www.example.com2 URLs skippedrobots.txt unreachable (503), host skipped");
    expect(text(html)).toContain("redirects to https://example.com/private/new");
    expect(html).not.toMatch(/danger|warning|critical/i);
  });

  it("names an origin whose only skips are Disallow hits", () => {
    const html = renderToStaticMarkup(
      <RobotsPanel
        report={{
          ...empty,
          skipped: 3,
          disallowed: 3,
          origins: [{ origin: "https://example.com", outcome: "rules", robotsStatus: 200, crawlDelay: null, skipped: 3, message: null }],
        }}
      />
    );
    expect(text(html)).toContain("https://example.com3 URLs skippedDisallowed by a rule");
  });

  it("keeps each count with its label and lets URLs wrap only after / ? & or -", () => {
    const url = "https://www.example-shop.com/collections/all-products?sort=price&page=2";
    const html = renderToStaticMarkup(
      <RobotsPanel
        report={{
          ...empty,
          skipped: 12,
          disallowed: 12,
          samples: [{ url }],
          origins: [
            {
              origin: "https://www.example-shop.com",
              outcome: "stopped-early",
              robotsStatus: 200,
              crawlDelay: 20,
              skipped: 12,
              message: "Crawl-delay 20 s: stopped early after 3 requests, the rest does not fit in the 30-minute crawl limit",
            },
          ],
        }}
      />
    );
    // The count is one unbreakable element, not the tail of the message.
    expect(html).toMatch(/<span class="[^"]*whitespace-nowrap[^"]*">12 URLs skipped<\/span>/);
    expect(html).not.toContain("break-all");
    expect(html).toContain(
      `<span title="${url.replace(/&/g, "&amp;")}" class="[overflow-wrap:anywhere]">` +
        "https://www.example-<wbr/>shop.com/<wbr/>collections/<wbr/>all-<wbr/>products?<wbr/>sort=price&amp;<wbr/>page=2</span>"
    );
  });
});
