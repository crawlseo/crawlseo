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
  label: string;
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
    label: "Overview",
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
          { href: `/sites/${activeSiteId}/saved-keywords`, label: "Saved Keywords", icon: Bookmark },
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
          { href: `/sites/${activeSiteId}/keyword-research`, label: "Keyword Research", icon: SearchCheck },
          { href: `/sites/${activeSiteId}/domain-overview`, label: "Domain Overview", icon: Globe },
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
    <nav className="flex-1 space-y-5 overflow-y-auto px-2 text-sm">
      {groups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {group.label}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
              />
            ))}
          </div>
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

  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={item.label}
        className={cn(
          "flex size-10 items-center justify-center rounded-xl transition",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="size-4" />
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}
