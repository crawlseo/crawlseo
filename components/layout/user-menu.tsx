"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDown, Loader2, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/account/avatar";
import { signOutAction } from "@/app/(dashboard)/settings/actions";

const ITEM_CLASS =
  "flex h-9 w-full cursor-default items-center gap-2.5 rounded-sm px-2.5 text-[14px] text-text-strong outline-none select-none data-highlighted:bg-bg-section";

/**
 * Sidebar footer: the signed-in user as a button that opens Settings and
 * Sign out, and the app version under it. Collapsed, only the avatar shows.
 */
export function UserMenu({
  name,
  email,
  image,
  version,
  collapsed = false,
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  version: string;
  collapsed?: boolean;
}) {
  const label = name?.trim() || email || "Account";
  const [signingOut, startSignOut] = useTransition();

  return (
    <div className={cn("flex flex-col gap-1.5", collapsed ? "items-center" : "px-0.5")}>
      <Menu.Root>
        <Menu.Trigger
          aria-label={collapsed ? `${label}: account menu` : undefined}
          title={collapsed ? label : undefined}
          className={cn(
            "flex items-center rounded-md text-left transition-colors outline-none hover:bg-bg-section focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:bg-bg-section",
            collapsed ? "size-10 justify-center" : "h-11 w-full gap-2.5 px-2"
          )}
        >
          <Avatar name={name} email={email} image={image} className={collapsed ? "size-7" : undefined} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-strong" title={label}>
                {label}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </>
          )}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="top" align="start" sideOffset={6} className="isolate z-50 outline-none">
            <Menu.Popup className="min-w-[208px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[var(--shadow-3)] outline-none">
              {email && (
                <p className="truncate px-2.5 pt-1.5 pb-2 text-[12px] leading-4 text-muted-foreground" title={email}>
                  {email}
                </p>
              )}
              <Menu.LinkItem render={<Link href="/settings" />} className={ITEM_CLASS}>
                <Settings className="size-4 text-muted-foreground" aria-hidden />
                Settings
              </Menu.LinkItem>
              <Menu.Item
                className={ITEM_CLASS}
                disabled={signingOut}
                closeOnClick={false}
                onClick={() => startSignOut(() => signOutAction())}
              >
                {signingOut ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <LogOut className="size-4 text-muted-foreground" aria-hidden />
                )}
                Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <span
        className={cn("font-data text-[11px] leading-4 text-muted-foreground", !collapsed && "px-2")}
        title="crawlseo version"
      >
        v{version}
      </span>
    </div>
  );
}
