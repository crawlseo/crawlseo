import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const { SyncButton, syncOutcome } = await import("./sync-button");
const { PageHeader } = await import("@/components/ui/page-header");

describe("syncOutcome", () => {
  it("reports rows synced as a success", () => {
    expect(syncOutcome(200, { keywordsInserted: 12, pagesInserted: 4 })).toEqual({
      tone: "success",
      text: "Synced 12 keywords · 4 pages",
    });
  });

  it("counts pages without keywords as a success", () => {
    expect(syncOutcome(200, { keywordsInserted: 0, pagesInserted: 7 }).tone).toBe("success");
  });

  it("reports zero keywords and zero pages as no data, neutral, with the API's date window", () => {
    expect(
      syncOutcome(200, { keywordsInserted: 0, pagesInserted: 0, startDate: "2026-09-16", endDate: "2026-10-14" })
    ).toEqual({
      tone: "empty",
      text: "GSC returned no data for 16 Sep 2026 to 14 Oct 2026. Check the property in Site settings.",
    });
  });

  it("still says no data when the response has no dates", () => {
    expect(syncOutcome(200, {})).toEqual({
      tone: "empty",
      text: "GSC returned no data. Check the property in Site settings.",
    });
  });

  it("passes on API errors and asks to reconnect when Google access expired", () => {
    expect(syncOutcome(500, { error: "Quota exceeded" })).toEqual({ tone: "error", text: "Quota exceeded" });
    expect(syncOutcome(400, {})).toEqual({ tone: "error", text: "Sync failed" });
    expect(syncOutcome(401, { code: "REAUTH_REQUIRED", error: "x" }).tone).toBe("reauth");
  });
});

describe("SyncButton layout", () => {
  it("reserves a two-line status slot beside the button, so a message cannot move it", () => {
    const html = renderToStaticMarkup(<SyncButton siteId="s" />);
    expect(html).toMatch(/<p role="status"[^>]*class="[^"]*line-clamp-2[^"]*"/);
    expect(html).not.toContain("space-y");
    // Header use: the message sits before the button, the button stays at the end.
    expect(html).toMatch(/^<div class="[^"]*flex-row-reverse/);
  });

  it("renders a small outline button with the message after it on cards", () => {
    const html = renderToStaticMarkup(<SyncButton siteId="s" variant="outline" size="sm" messageSide="end" />);
    expect(html).toMatch(/^<div class="[^"]*flex-row items-start/);
    // Three lines are reserved even while empty, so a message never grows the card.
    expect(html).toMatch(/<p role="status"[^>]*class="[^"]*line-clamp-3 h-12/);
    expect(html).toContain("bg-button-secondary");
    expect(html).toContain("h-8");
    expect(html).not.toContain("bg-button-primary");
    expect(html).not.toContain("w-full");
  });

  it("in a page header renders just the button and reserves the status row under the header", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Keywords" reserveStatus actions={<SyncButton siteId="s" />} />
    );
    // No message slot beside the button, so nothing in the actions row can grow.
    expect(html).not.toContain('role="status"');
    // The empty row keeps its height: two lines on phones, one from sm up.
    expect(html).toContain('class="mt-3 space-y-1 min-h-8 sm:min-h-4"');
  });

  it("leaves headers without reserveStatus as they were", () => {
    const html = renderToStaticMarkup(<PageHeader title="Settings" actions={<span>x</span>} />);
    expect(html).not.toContain("min-h-8");
    expect(html).not.toContain("mt-3");
  });
});
