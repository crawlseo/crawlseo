"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Globe,
  Search,
  FileText,
  Bug,
  Gauge,
  Lightbulb,
  Bell,
  Settings,
  Bookmark,
  Bot,
  Link as LinkIcon,
  SearchCheck,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

type NavGroup = {
  /** Shown above the items; the first group has none, its items speak for themselves. */
  label?: string;
  items: NavItem[];
};

export function SidebarNav({
  sites,
  collapsed = false,
}: {
  sites: { id: string; domain: string }[];
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const match = pathname.match(/\/sites\/([^/]+)/);
  const activeSiteId =
    match?.[1] && sites.some((s) => s.id === match[1]) ? match[1] : undefined;

  const overviewNav: NavGroup = {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/sites", label: "Sites", icon: Globe, exact: true },
    ],
  };

  const workspaceNav: NavGroup | null = activeSiteId
    ? {
        label: "Workspace",
        items: [
          { href: `/sites/${activeSiteId}`, label: "Overview", icon: LayoutDashboard, exact: true },
          { href: `/sites/${activeSiteId}/keywords`, label: "Keywords", icon: Search },
          { href: `/sites/${activeSiteId}/saved-keywords`, label: "Saved keywords", icon: Bookmark },
          { href: `/sites/${activeSiteId}/pages`, label: "Pages", icon: FileText },
          { href: `/sites/${activeSiteId}/crawl`, label: "Crawl / Audit", icon: Bug },
          { href: `/sites/${activeSiteId}/vitals`, label: "Vitals", icon: Gauge },
          { href: `/sites/${activeSiteId}/opportunities`, label: "Opportunities", icon: Lightbulb },
          { href: `/sites/${activeSiteId}/alerts`, label: "Alerts", icon: Bell },
        ],
      }
    : null;

  const researchNav: NavGroup | null = activeSiteId
    ? {
        label: "Research",
        items: [
          { href: `/sites/${activeSiteId}/keyword-research`, label: "Keyword research", icon: SearchCheck },
          { href: `/sites/${activeSiteId}/domain-overview`, label: "Domain overview", icon: Globe },
          { href: `/sites/${activeSiteId}/backlinks`, label: "Backlinks", icon: LinkIcon },
        ],
      }
    : null;

  const connectNav: NavGroup | null = activeSiteId
    ? {
        label: "Connect",
        items: [
          { href: `/sites/${activeSiteId}/mcp`, label: "AI & MCP", icon: Bot },
          { href: `/sites/${activeSiteId}/settings`, label: "Settings", icon: Settings },
        ],
      }
    : null;

  const groups = [overviewNav, workspaceNav, researchNav, connectNav].filter(
    (g): g is NavGroup => g !== null
  );

  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-[22px]", collapsed && "items-center")}>
      {groups.map((group) => (
        <div key={group.label ?? "main"} className="flex flex-col gap-0.5">
          {!collapsed && group.label && (
            <p className="px-2.5 pb-1.5 text-[12px] leading-4 text-muted-foreground">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const Icon = item.icon;

  // The active item is never coloured: a neutral background and weight only.
  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex size-10 items-center justify-center rounded-md transition-colors",
          active
            ? "bg-border-soft text-text-strong"
            : "text-muted-foreground hover:bg-bg-section hover:text-text-strong"
        )}
      >
        <Icon className="size-4" aria-hidden />
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[34px] items-center rounded-md px-2.5 text-[14px] transition-colors",
        active
          ? "bg-border-soft font-medium text-text-strong"
          : "text-text hover:bg-bg-section hover:text-text-strong"
      )}
    >
      {item.label}
    </Link>
  );
}
