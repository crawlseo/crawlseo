"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { Dialog } from "@base-ui/react/dialog";
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { workspaceItems } from "@/lib/site-routes";
import { AddSiteModal } from "@/components/sites/add-site-modal";

interface Site {
  id: string;
  domain: string;
}

const ITEM_CLASS =
  "flex h-9 w-full cursor-default items-center gap-2.5 rounded-sm px-2.5 font-data text-[13px] text-text-strong outline-none select-none data-highlighted:bg-bg-section";

/**
 * The workspace switcher at the top of the sidebar: All sites (the home),
 * each site, and Add site. Switching site keeps the open sub-page. Collapsed,
 * it is a square button with the site's first letter, or the grid icon on the
 * home.
 */
export function SiteSwitcher({
  sites,
  collapsed = false,
  extraSubPages,
}: {
  sites: Site[];
  collapsed?: boolean;
  /** Site sub-pages beyond the shared list, kept when switching site. */
  extraSubPages?: readonly string[];
}) {
  const pathname = usePathname();
  const items = workspaceItems(pathname, sites, extraSubPages);
  const current = items.find((i) => i.kind !== "add" && i.current);
  const label = current?.label ?? "All sites";
  const onSite = current?.kind === "site";

  // The menu closes on Add site, then this handle opens the add-site dialog.
  const [addSite] = useState(() => Dialog.createHandle());

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label={`Workspace: ${label}`}
          title={collapsed ? label : undefined}
          className={cn(
            "flex items-center rounded-md border border-border bg-bg font-data text-[13px] text-text-strong transition-colors outline-none hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:border-line-strong",
            collapsed ? "size-10 justify-center" : "h-[38px] w-full justify-between gap-2 px-2.5"
          )}
        >
          {collapsed ? (
            onSite ? (
              <span aria-hidden className="text-[14px] font-medium uppercase">
                {label.charAt(0)}
              </span>
            ) : (
              <LayoutGrid className="size-4" aria-hidden />
            )
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2">
                {!onSite && <LayoutGrid className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                <span className="truncate">{label}</span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </>
          )}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side={collapsed ? "right" : "bottom"}
            align="start"
            sideOffset={6}
            className="isolate z-50 outline-none"
          >
            <Menu.Popup className="max-h-[min(420px,var(--available-height))] w-[var(--anchor-width)] min-w-[220px] max-w-[300px] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[var(--shadow-3)] outline-none">
              {items.map((item) => {
                if (item.kind === "add") {
                  return (
                    <div key="add">
                      <Menu.Separator className="mx-1 my-1 h-px bg-border" />
                      <Menu.Item className={ITEM_CLASS} onClick={() => addSite.open(null)}>
                        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        {item.label}
                      </Menu.Item>
                    </div>
                  );
                }
                return (
                  <Menu.LinkItem
                    key={item.kind === "site" ? item.id : "all"}
                    render={<Link href={item.href} />}
                    closeOnClick
                    aria-current={item.current ? "page" : undefined}
                    className={ITEM_CLASS}
                  >
                    {item.kind === "all" ? (
                      <LayoutGrid className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center text-[11px] text-muted-foreground uppercase">
                        {item.label.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.current && <Check className="size-3.5 shrink-0 text-text-strong" aria-hidden />}
                  </Menu.LinkItem>
                );
              })}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <AddSiteModal handle={addSite} />
    </>
  );
}
