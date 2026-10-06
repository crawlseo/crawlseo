import type { MetadataRoute } from "next";

// Icons copied from the crawlseo-web repo, docs/brand/v3 (crawlseo-icon-192.png, crawlseo-icon-512.png).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "crawlseo",
    short_name: "crawlseo",
    description: "Self-hosted SEO monitoring: GSC, crawl health, Core Web Vitals",
    start_url: "/dashboard",
    display: "standalone",
    theme_color: "#FFFFFF",
    background_color: "#FFFFFF",
    icons: [
      { src: "/brand/crawlseo-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/crawlseo-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
