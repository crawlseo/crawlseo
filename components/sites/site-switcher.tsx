"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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

export function SiteSwitcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSites() {
      try {
        const response = await fetch("/api/sites");
        if (response.ok) {
          const data = (await response.json()) as Site[];
          setSites(data);

          // Set initial selected site from localStorage or first site
          const saved = localStorage.getItem("selectedSiteId");
          if (saved && data.some((s) => s.id === saved)) {
            setSelectedSite(saved);
          } else if (data.length > 0) {
            setSelectedSite(data[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to load sites:", error);
      } finally {
        setLoading(false);
      }
    }

    loadSites();
  }, []);

  function handleSiteChange(siteId: string) {
    setSelectedSite(siteId);
    localStorage.setItem("selectedSiteId", siteId);

    // Get the current pathname and keep it but update the siteId in the URL if needed
    const pathname = window.location.pathname;
    if (pathname.includes("/sites/")) {
      // Replace the site ID in the URL
      const newPathname = pathname.replace(/\/sites\/[^/]+/, `/sites/${siteId}`);
      router.push(newPathname);
    }
  }

  if (loading || sites.length === 0) {
    return null;
  }

  if (sites.length === 1) {
    return (
      <div className="text-sm">
        <p className="text-slate-600">Current site</p>
        <p className="font-medium text-slate-900">{sites[0].domain}</p>
      </div>
    );
  }

  return (
    <div className="w-56">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
        Select Site
      </p>
      <Select value={selectedSite} onValueChange={(value) => value !== null && handleSiteChange(value)}>
        <SelectTrigger className="bg-white border-slate-200">
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
