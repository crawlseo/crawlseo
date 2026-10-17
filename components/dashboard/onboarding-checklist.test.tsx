import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/sites/add-site-modal", () => ({
  AddSiteModal: ({ handle }: { handle?: unknown }) => (handle ? "[add-site-dialog]" : null),
}));

const { OnboardingChecklist } = await import("./onboarding-checklist");

function render(hasSites: boolean) {
  return renderToStaticMarkup(
    <OnboardingChecklist
      hasSites={hasSites}
      hasGscConnected={false}
      hasSyncedData={false}
      hasCrawled={false}
      firstSiteId={hasSites ? "site-a" : undefined}
    />
  );
}

describe("onboarding checklist", () => {
  it("opens the add-site dialog from the Add site step when there is no site", () => {
    const html = render(false);
    expect(html).toMatch(/<button type="button" class="[^"]*">Add site<svg/);
    expect(html).not.toMatch(/<a [^>]*>Add site</);
    expect(html).toContain("[add-site-dialog]");
  });

  it("keeps the other steps as links", () => {
    const html = render(false);
    expect(html).toMatch(/<a [^>]*href="\/sites"[^>]*>Connect</);
    expect(html).toMatch(/<a [^>]*href="\/sites"[^>]*>Sync now</);
  });

  it("has no dialog once a site exists", () => {
    const html = render(true);
    expect(html).not.toContain("[add-site-dialog]");
    expect(html).toMatch(/<a [^>]*href="\/sites\/site-a"[^>]*>Connect</);
  });
});
