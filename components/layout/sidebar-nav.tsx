"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/layout/nav-link";

export function SidebarNav({
  sites,
}: {
  sites: { id: string; domain: string }[];
}) {
  const pathname = usePathname();
  const match = pathname.match(/\/sites\/([^/]+)/);
  const activeSiteId =
    match?.[1] && sites.some((s) => s.id === match[1]) ? match[1] : undefined;

  const siteNav = activeSiteId
    ? [
        { href: `/sites/${activeSiteId}`, label: "Overview", exact: true },
        { href: `/sites/${activeSiteId}/opportunities`, label: "Opportunities" },
        { href: `/sites/${activeSiteId}/keywords`, label: "Keywords" },
        { href: `/sites/${activeSiteId}/pages`, label: "Pages" },
        { href: `/sites/${activeSiteId}/crawl`, label: "Crawl" },
        { href: `/sites/${activeSiteId}/vitals`, label: "Vitals" },
        { href: `/sites/${activeSiteId}/alerts`, label: "Alerts" },
      ]
    : [];

  return (
    <nav className="space-y-6 text-sm">
      <div>
        <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Workspace
        </p>
        <div className="space-y-0.5">
          <NavLink href="/dashboard">Overview</NavLink>
          <NavLink href="/sites" exact>
            Sites
          </NavLink>
        </div>
      </div>

      {siteNav.length > 0 && (
        <div>
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Active site
          </p>
          <div className="space-y-0.5">
            {siteNav.map((item) => (
              <NavLink key={item.href} href={item.href} exact={item.exact}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
