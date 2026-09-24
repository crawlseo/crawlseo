import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { VitalsStatusMessage } from "./action-buttons";

describe("VitalsStatusMessage", () => {
  it("explains an exhausted quota and links to the API keys settings", () => {
    const html = renderToString(
      createElement(VitalsStatusMessage, { siteId: "site-1", status: { kind: "quota" } })
    );
    expect(html).toContain("quota is exhausted");
    expect(html).toContain('href="/sites/site-1/settings#api-keys"');
    expect(html).toContain("API keys");
  });
});
