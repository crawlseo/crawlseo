"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/format";
import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { CloudPromo } from "@/components/layout/cloud-promo";
import { SiteSwitcher } from "@/components/sites/site-switcher";
import { PanelLeftClose, PanelLeftOpen, Menu, X } from "lucide-react";

export type ShellSite = { id: string; domain: string; dataThrough: string | null };

type AppShellProps = {
  email?: string | null;
  name?: string | null;
  children: React.ReactNode;
  sites: ShellSite[];
  showCloudPromo: boolean;
};

const COLLAPSED_KEY = "crawlseo-sidebar-collapsed";

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSED_KEY, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSED_KEY, onChange);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function AppShell({ email, name, children, sites, showCloudPromo }: AppShellProps) {
  const displayName = name || email?.split("@")[0] || "User";
  const pathname = usePathname();

  // The mobile drawer is open only on the path it was opened on, so a route change closes it.
  const [openOnPath, setOpenOnPath] = useState<string | null>(null);
  const mobileOpen = openOnPath === pathname;
  const setMobileOpen = (open: boolean) => setOpenOnPath(open ? pathname : null);

  // Collapsed sidebar, remembered in localStorage (expanded on the server and when storage is blocked).
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  function toggleCollapsed() {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(!collapsed));
    } catch {
      // Storage blocked: the toggle cannot be remembered.
    }
    window.dispatchEvent(new Event(COLLAPSED_KEY));
  }

  // Status block: the open site's latest GSC day, or the latest across all sites.
  const activeId = pathname.match(/\/sites\/([^/]+)/)?.[1];
  const activeSite = sites.find((s) => s.id === activeId);
  const dataThrough = activeSite
    ? activeSite.dataThrough
    : sites.reduce<string | null>(
        (max, s) => (s.dataThrough && (!max || s.dataThrough > max) ? s.dataThrough : max),
        null
      );

  const sidebarContent = (
    <div className={cn("flex min-h-full flex-col gap-[22px] py-5", collapsed ? "px-2" : "px-3")}>
      <div className="flex flex-col gap-3.5">
        <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between")}>
          <Link
            href="/dashboard"
            aria-label="crawlseo"
            className={cn("flex h-8 items-center text-text-strong", !collapsed && "px-2.5")}
          >
            <Logo variant={collapsed ? "mark" : "lockup"} decorative className="h-[22px]" />
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-bg-section hover:text-text-strong md:flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </button>
        </div>
        {sites.length > 0 && !collapsed && <SiteSwitcher sites={sites} />}
      </div>

      <SidebarNav sites={sites} collapsed={collapsed} />

      <div className="mt-auto flex flex-col gap-3">
        {showCloudPromo && !collapsed && <CloudPromo />}

        {!collapsed && (
          <div className="flex flex-col gap-1 border-t border-border px-2.5 pt-3 text-[11px] leading-4 text-muted-foreground">
            <span className="mono-label">
              {dataThrough ? `GSC data through ${formatDay(dataThrough)}` : "No GSC data yet"}
            </span>
            <span className="mono-label">Search data lags 3 days</span>
          </div>
        )}

        {!collapsed && (
          <div className="flex items-center justify-between gap-2 px-2.5 text-[12px] leading-4">
            <span className="truncate text-muted-foreground" title={email ?? displayName}>
              {email ?? displayName}
            </span>
            {/* An Auth.js API route, not a page: it needs a full page load, which next/link would skip. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/auth/signout" className="text-link shrink-0">
              Log out
            </a>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 z-20 hidden h-screen shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:block",
          collapsed ? "w-16" : "w-[232px]"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-text-strong/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        inert={!mobileOpen}
      >
        <div className="flex items-center justify-end px-3 pt-3">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-bg-section hover:text-text-strong"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1">{sidebarContent}</div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg px-3 md:hidden">
          <Link
            href="/dashboard"
            aria-label="crawlseo"
            className="flex h-11 items-center px-2 text-text-strong"
          >
            <Logo decorative className="h-[22px]" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="flex size-11 items-center justify-center rounded-md text-text-strong hover:bg-bg-section"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </header>

        <main className="w-full max-w-[1320px] flex-1 px-5 py-6 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}
