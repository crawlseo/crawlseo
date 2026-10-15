import { describe, expect, it } from "vitest";
import { sourceLabel } from "./domain-overview-client";

describe("sourceLabel", () => {
  it("shows UNAVAILABLE, not NONE, when no provider had data", () => {
    expect(sourceLabel("none")).toBe("UNAVAILABLE");
  });

  it("keeps the provider name for real sources", () => {
    expect(sourceLabel("dataforseo")).toBe("DATAFORSEO");
    expect(sourceLabel("gsc")).toBe("GSC");
  });
});
