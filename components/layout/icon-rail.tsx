"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  {
    href: "/dashboard",
    label: "Overview",
    match: (p: string) => p === "/dashboard" || p === "/",
    icon: (
      <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
        <path
          d="M4 18 L12 5 L20 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="15.5" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/sites",
    label: "Sites",
    match: (p: string) => p.startsWith("/sites"),
    icon: (
      <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
];

export function IconRail() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-16 shrink-0 flex-col items-center border-r border-sidebar-border bg-rail py-4">
      <Link
        href="/dashboard"
        className="mb-6 flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-2)]"
        aria-label="CrawlSEO home"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <path
            d="M4 18 L12 5 L20 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="15.5" r="1.6" fill="currentColor" />
        </svg>
      </Link>

      <div className="flex flex-1 flex-col items-center gap-2">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex size-10 items-center justify-center rounded-2xl transition",
                active
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
