import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { VitalsStatusMessage } from "./action-buttons";

describe("VitalsStatusMessage", () => {
  it("explains an exhausted quota and links to the PageSpeed connection in Settings", () => {
    const html = renderToString(
      createElement(VitalsStatusMessage, { status: { kind: "quota" } })
    );
    expect(html).toContain("quota is exhausted");
    expect(html).toContain('href="/settings?connect=google_pagespeed#connections"');
    expect(html).toContain("Connections");
  });
});
