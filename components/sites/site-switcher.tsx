"use client";

import { useRouter, usePathname } from "next/navigation";
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
  const fromPath =
    match?.[1] && sites.some((s) => s.id === match[1]) ? match[1] : undefined;
  const selected = fromPath ?? sites[0].id;

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

  if (sites.length === 1) {
    return (
      <div className="rounded-lg border border-border/60 bg-panel/60 px-3 py-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Site
        </p>
        <p className="truncate text-sm font-medium text-foreground">
          {sites[0].domain}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 px-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Switch site
      </p>
      <Select value={selected} onValueChange={handleSiteChange}>
        <SelectTrigger className="w-full border-border/70 bg-panel">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.domain}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
