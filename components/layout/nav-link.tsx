"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  // Avoid /sites matching /sites/[id] when exact is set on the list route
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center rounded-lg px-3 py-2 font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-signal shadow-[inset_2px_0_0_0_oklch(0.84_0.18_145)]"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
      )}
    >
      {children}
    </Link>
  );
}
