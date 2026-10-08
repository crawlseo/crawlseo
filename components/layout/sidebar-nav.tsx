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
import { useT } from "@/components/i18n/provider";

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
  const t = useT();
  const pathname = usePathname();
  const match = pathname.match(/\/sites\/([^/]+)/);
  const activeSiteId = match?.[1] && sites.some((s) => s.id === match[1]) ? match[1] : undefined;

  const overviewNav: NavGroup = {
    items: [
      { href: "/dashboard", label: t("Dashboard"), icon: LayoutDashboard },
      { href: "/sites", label: t("Sites"), icon: Globe, exact: true },
      { href: "/settings", label: t("Settings"), icon: Settings },
    ],
  };

  const workspaceNav: NavGroup | null = activeSiteId
    ? {
        label: t("Workspace"),
        items: [
          {
            href: `/sites/${activeSiteId}`,
            label: t("Overview"),
            icon: LayoutDashboard,
            exact: true,
          },
          { href: `/sites/${activeSiteId}/keywords`, label: t("Keywords"), icon: Search },
          {
            href: `/sites/${activeSiteId}/saved-keywords`,
            label: t("Saved keywords"),
            icon: Bookmark,
          },
          { href: `/sites/${activeSiteId}/pages`, label: t("Pages"), icon: FileText },
          { href: `/sites/${activeSiteId}/crawl`, label: t("Crawl / Audit"), icon: Bug },
          { href: `/sites/${activeSiteId}/vitals`, label: t("Vitals"), icon: Gauge },
          {
            href: `/sites/${activeSiteId}/opportunities`,
            label: t("Opportunities"),
            icon: Lightbulb,
          },
          { href: `/sites/${activeSiteId}/alerts`, label: t("Alerts"), icon: Bell },
        ],
      }
    : null;

  const researchNav: NavGroup | null = activeSiteId
    ? {
        label: t("Research"),
        items: [
          {
            href: `/sites/${activeSiteId}/keyword-research`,
            label: t("Keyword research"),
            icon: SearchCheck,
          },
          {
            href: `/sites/${activeSiteId}/domain-overview`,
            label: t("Domain overview"),
            icon: Globe,
          },
          { href: `/sites/${activeSiteId}/backlinks`, label: t("Backlinks"), icon: LinkIcon },
        ],
      }
    : null;

  const connectNav: NavGroup | null = activeSiteId
    ? {
        label: t("Connect"),
        items: [
          { href: `/sites/${activeSiteId}/mcp`, label: t("AI & MCP"), icon: Bot },
          { href: `/sites/${activeSiteId}/settings`, label: t("Site settings"), icon: Settings },
        ],
      }
    : null;

  const groups = [overviewNav, workspaceNav, researchNav, connectNav].filter(
    (g): g is NavGroup => g !== null,
  );

  return (
    <nav
      aria-label={t("Main")}
      className={cn("flex flex-col gap-[22px]", collapsed && "items-center")}
    >
      {groups.map((group) => (
        <div key={group.label ?? "main"} className="flex flex-col gap-0.5">
          {!collapsed && group.label && (
            <p className="px-2.5 pb-1.5 text-[12px] leading-4 text-muted-foreground">
              {t(group.label)}
            </p>
          )}
          {group.items.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
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
  const t = useT();
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const Icon = item.icon;

  // The active item is never coloured: a neutral background and weight only.
  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={t(item.label)}
        aria-label={t(item.label)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex size-10 items-center justify-center rounded-md transition-colors",
          active
            ? "bg-border-soft text-text-strong"
            : "text-muted-foreground hover:bg-bg-section hover:text-text-strong",
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
          : "text-text hover:bg-bg-section hover:text-text-strong",
      )}
    >
      {t(item.label)}
    </Link>
  );
}
