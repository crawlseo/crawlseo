/** The home: every site, the onboarding checklist and the cross-site summary. */
export const ALL_SITES_HREF = "/sites";

/**
 * Site sub-pages, the first path segment after /sites/[siteId]. Switching to
 * another site keeps the one that is open. A build with more site routes
 * passes its own list on top of this one.
 */
export const SITE_SUB_PAGES = [
  "keywords",
  "saved-keywords",
  "pages",
  "crawl",
  "vitals",
  "opportunities",
  "alerts",
  "keyword-research",
  "domain-overview",
  "backlinks",
  "mcp",
  "settings",
] as const;

/** The site id in the path, when it is one of the user's sites. */
export function activeSiteId(pathname: string, sites: readonly { id: string }[]): string | null {
  const id = pathname.match(/^\/sites\/([^/]+)/)?.[1];
  return id && sites.some((s) => s.id === id) ? id : null;
}

/** Where switching to a site leads: the same sub-page when it is a known one, else the site overview. */
export function sitePathFor(
  pathname: string,
  siteId: string,
  extraSubPages: readonly string[] = []
): string {
  const sub = pathname.match(/^\/sites\/[^/]+\/([^/]+)/)?.[1];
  const known = (SITE_SUB_PAGES as readonly string[]).includes(sub ?? "") || extraSubPages.includes(sub ?? "");
  return sub && known ? `/sites/${siteId}/${sub}` : `/sites/${siteId}`;
}

export type WorkspaceItem =
  | { kind: "all"; label: string; href: string; current: boolean }
  | { kind: "site"; id: string; label: string; href: string; current: boolean }
  | { kind: "add"; label: string };

/** The switcher menu: All sites, then each site, then Add site. */
export function workspaceItems(
  pathname: string,
  sites: readonly { id: string; domain: string }[],
  extraSubPages: readonly string[] = []
): WorkspaceItem[] {
  const active = activeSiteId(pathname, sites);
  return [
    { kind: "all", label: "All sites", href: ALL_SITES_HREF, current: active === null },
    ...sites.map((s) => ({
      kind: "site" as const,
      id: s.id,
      label: s.domain,
      href: sitePathFor(pathname, s.id, extraSubPages),
      current: s.id === active,
    })),
    { kind: "add", label: "Add site" },
  ];
}
