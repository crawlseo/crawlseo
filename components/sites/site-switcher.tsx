"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Site {
  id: string;
  domain: string;
}

export function SiteSwitcher({ sites }: { sites: Site[] }) {
  const router = useRouter();
  const pathname = usePathname();

  if (sites.length === 0) return null;

  const match = pathname.match(/\/sites\/([^/]+)/);
  const selected =
    match?.[1] && sites.some((s) => s.id === match[1]) ? match[1] : null;

  function handleSiteChange(siteId: string | null) {
    if (!siteId) return;

    if (pathname.includes("/sites/")) {
      const sub = pathname.match(/\/sites\/[^/]+\/([^/]+)/)?.[1];
      if (sub && ["keywords", "pages", "crawl", "vitals", "opportunities", "alerts"].includes(sub)) {
        router.push(`/sites/${siteId}/${sub}`);
        return;
      }
      router.push(`/sites/${siteId}`);
      return;
    }

    router.push(`/sites/${siteId}`);
  }

  // A bordered button in mono with a chevron, as on the sidebar board. The domain keeps its own case.
  const box =
    "flex h-[38px] w-full items-center justify-between gap-2 rounded-md border border-border bg-bg px-2.5 font-data text-[13px] text-text-strong";

  // One site: the button leads to the sites list, where another site is added.
  if (sites.length === 1) {
    return (
      <Link
        href="/sites"
        aria-label={`Site: ${sites[0].domain}. Switch or add a site`}
        className={`${box} transition-colors hover:border-line-strong`}
      >
        <span className="truncate">{sites[0].domain}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    );
  }

  const items = sites.map((site) => ({ value: site.id, label: site.domain }));

  return (
    <Select value={selected} onValueChange={handleSiteChange} items={items}>
      <SelectTrigger aria-label="Switch site" className={`${box} py-0 pr-2 data-[size=default]:h-[38px]`}>
        <SelectValue placeholder="Choose a site" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map(({ value, label }) => (
          <SelectItem key={value} value={value} className="font-data text-[13px]">
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
