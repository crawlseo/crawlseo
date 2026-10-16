import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { ApiKeysSection } = await import("./api-keys-section");

const CAP = "max-w-[560px]";

/**
 * Walks the markup and reports, for each label, input, textarea and button, whether it sits inside an element
 * whose class list has the width cap.
 */
function capped(html: string) {
  const out: { tag: string; capped: boolean }[] = [];
  const stack: boolean[] = [];
  for (const [, close, tag, attrs] of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/g)) {
    if (close) {
      if (tag === "div") stack.pop();
      continue;
    }
    if (["label", "input", "textarea", "button"].includes(tag)) out.push({ tag, capped: stack.includes(true) });
    if (tag === "div") stack.push(/class="[^"]*\bmax-w-\[560px\]/.test(attrs));
  }
  return out;
}

describe("ApiKeysSection", () => {
  it("caps the key forms at 560 px: labels, fields and messages, not the cards", () => {
    const html = renderToStaticMarkup(
      <ApiKeysSection
        initialStatus={{
          dataforseo: { connected: false },
          google_pagespeed: { connected: false },
          bing: { connected: false },
        }}
      />
    );
    const items = capped(html);
    const fields = items.filter((i) => i.tag !== "button");
    // DataForSEO: login and password. PageSpeed and Bing: one API key each.
    expect(fields.filter((i) => i.tag === "input")).toHaveLength(4);
    expect(fields.filter((i) => i.tag === "label")).toHaveLength(4);
    expect(fields.every((i) => i.capped)).toBe(true);
    // One capped form per provider; the card around it keeps the full width.
    expect(html.split(CAP).length - 1).toBe(3);
    expect(html).not.toMatch(/class="[^"]*bg-card[^"]*max-w-\[560px\]/);
  });

  it("keeps the buttons as they were: same classes, inside the form", () => {
    const html = renderToStaticMarkup(
      <ApiKeysSection
        initialStatus={{
          dataforseo: { connected: false },
          google_pagespeed: { connected: false },
          bing: { connected: false },
        }}
      />
    );
    const buttons = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>/g)].map((m) => m[1]);
    // Test connection (DataForSEO, Bing) and Save Key (all three).
    expect(buttons).toHaveLength(5);
    expect(buttons.some((c) => c.includes("max-w"))).toBe(false);
    expect(buttons.some((c) => /\bw-full\b/.test(c))).toBe(false);
  });

  it("has no form, and so no cap, for a connected provider", () => {
    const html = renderToStaticMarkup(
      <ApiKeysSection
        initialStatus={{
          dataforseo: { connected: true, updatedAt: "2026-10-01T00:00:00.000Z" },
          google_pagespeed: { connected: true, updatedAt: "2026-10-01T00:00:00.000Z" },
          bing: { connected: true, updatedAt: "2026-10-01T00:00:00.000Z" },
        }}
      />
    );
    expect(html).not.toContain("<input");
    expect(html).not.toContain(CAP);
  });
});
