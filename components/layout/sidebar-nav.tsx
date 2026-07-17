"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavLink } from "@/components/layout/nav-link";
import { cn } from "@/lib/utils";

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
        {
          href: `/sites/${activeSiteId}/opportunities`,
          label: "Opportunities",
        },
        { href: `/sites/${activeSiteId}/keywords`, label: "Keywords" },
        { href: `/sites/${activeSiteId}/pages`, label: "Pages" },
        { href: `/sites/${activeSiteId}/crawl`, label: "Crawl" },
        { href: `/sites/${activeSiteId}/vitals`, label: "Vitals" },
        { href: `/sites/${activeSiteId}/alerts`, label: "Alerts" },
      ]
    : [];

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto text-sm">
      <div>
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          General
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
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
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

      {sites.length > 1 && (
        <div>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Properties
          </p>
          <div className="space-y-0.5 px-1">
            {sites.slice(0, 6).map((s) => {
              const active = activeSiteId === s.id;
              return (
                <Link
                  key={s.id}
                  href={`/sites/${s.id}`}
                  className={cn(
                    "block truncate rounded-xl px-3 py-2 text-sm transition",
                    active
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {s.domain}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
