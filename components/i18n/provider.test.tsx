import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
import { LocaleProvider } from "./provider";
import de from "@/lib/i18n/de.json";
import { CrawlButton, VitalsStatusMessage } from "@/components/sites/action-buttons";
import { LanguageSection } from "@/components/settings/language-section";

describe("localized interface", () => {
  it("renders German controls and selected page limit without changing API values", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="de" messages={de}>
        <CrawlButton siteId="test-site" />
      </LocaleProvider>,
    );
    expect(html).toContain("Crawl starten");
    expect(html).toContain("200 Seiten");
    expect(html).toContain('value="200"');
    expect(html).not.toContain("Run crawl");
  });
  it("keeps an English fallback without a provider", () => {
    expect(renderToStaticMarkup(<CrawlButton siteId="test-site" />)).toContain("200 pages");
  });
  it("localizes status messages and escapes interpolated text", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="de" messages={de}>
        <VitalsStatusMessage
          siteId="test-site"
          status={{ kind: "ok", text: "Saved 5 PageSpeed reports" }}
        />
      </LocaleProvider>,
    );
    expect(html).toContain("5 PageSpeed-Berichte gespeichert");
    expect(html).toContain('role="status"');
  });
  it("offers registered languages and selects the current language", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="de" messages={de}>
        <LanguageSection />
      </LocaleProvider>,
    );
    expect(html).toContain("Sprache der Oberfläche");
    expect(html).toMatch(/value="de"[^>]*selected/);
    expect(html).toContain("English");
    expect(html).toContain("Deutsch");
  });
});
