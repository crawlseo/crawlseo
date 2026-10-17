import { describe, expect, it } from "vitest";
import { SITE_SUB_PAGES, activeSiteId, sitePathFor, workspaceItems } from "./site-routes";

const sites = [
  { id: "a", domain: "Alpha.example" },
  { id: "b", domain: "beta.example" },
];

describe("sitePathFor", () => {
  it("keeps every shared site sub-page when switching site", () => {
    for (const sub of SITE_SUB_PAGES) {
      expect(sitePathFor(`/sites/a/${sub}`, "b")).toBe(`/sites/b/${sub}`);
    }
  });

  it("drops anything deeper than the sub-page", () => {
    expect(sitePathFor("/sites/a/crawl/123", "b")).toBe("/sites/b/crawl");
  });

  it("goes to the site overview from the overview, the home or an unknown sub-page", () => {
    expect(sitePathFor("/sites/a", "b")).toBe("/sites/b");
    expect(sitePathFor("/sites", "b")).toBe("/sites/b");
    expect(sitePathFor("/settings", "b")).toBe("/sites/b");
    expect(sitePathFor("/sites/a/answers", "b")).toBe("/sites/b");
  });

  it("keeps extra sub-pages passed in by the build", () => {
    expect(sitePathFor("/sites/a/answers", "b", ["answers"])).toBe("/sites/b/answers");
  });
});

describe("activeSiteId", () => {
  it("is the site in the path, only when it is one of the user's sites", () => {
    expect(activeSiteId("/sites/a/keywords", sites)).toBe("a");
    expect(activeSiteId("/sites/zzz", sites)).toBeNull();
    expect(activeSiteId("/sites", sites)).toBeNull();
    expect(activeSiteId("/settings", sites)).toBeNull();
  });
});

describe("workspaceItems", () => {
  it("is All sites, then each site in its own case, then Add site", () => {
    const items = workspaceItems("/sites", sites);
    expect(items.map((i) => i.label)).toEqual(["All sites", "Alpha.example", "beta.example", "Add site"]);
    expect(items[0]).toMatchObject({ kind: "all", href: "/sites", current: true });
    expect(items.at(-1)).toEqual({ kind: "add", label: "Add site" });
  });

  it("marks the open site and links the others to the same sub-page", () => {
    const items = workspaceItems("/sites/a/vitals", sites);
    expect(items[0]).toMatchObject({ kind: "all", current: false });
    expect(items[1]).toMatchObject({ id: "a", href: "/sites/a/vitals", current: true });
    expect(items[2]).toMatchObject({ id: "b", href: "/sites/b/vitals", current: false });
  });

  it("works with one site and with none", () => {
    expect(workspaceItems("/sites/a", [sites[0]]).map((i) => i.kind)).toEqual(["all", "site", "add"]);
    expect(workspaceItems("/sites", []).map((i) => i.kind)).toEqual(["all", "add"]);
  });
});
