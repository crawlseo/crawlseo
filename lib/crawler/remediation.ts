export const REMEDIATION: Record<string, { title: string; howToFix: string }> = {
  BROKEN_LINK: {
    title: "Broken Link",
    howToFix:
      "Update or remove the broken link. If the target page was moved, replace the URL with the new destination. Set up 301 redirects for any pages you have retired.",
  },
  MANAGED_INFRA: {
    title: "Managed Infrastructure Endpoint",
    howToFix:
      "This URL belongs to a CDN or hosting provider (e.g. Cloudflare /cdn-cgi/). It is managed automatically and is expected to return a non-200 status when accessed directly. No action is needed.",
  },
  REDIRECT: {
    title: "Redirect Detected",
    howToFix:
      "Update internal links to point directly to the final destination URL instead of the redirecting URL. Eliminate redirect chains by ensuring each redirect resolves in a single hop.",
  },
  MISSING_TITLE: {
    title: "Missing Title Tag",
    howToFix:
      "Add a unique <title> tag between 15 and 65 characters that accurately describes the page content and includes the primary target keyword.",
  },
  MISSING_DESCRIPTION: {
    title: "Missing Meta Description",
    howToFix:
      "Add a <meta name=\"description\"> tag between 50 and 160 characters that summarizes the page and entices users to click from search results.",
  },
  DUPLICATE_TITLE: {
    title: "Duplicate Title Tag",
    howToFix:
      "Write a unique title for each page. If pages have similar content, consider consolidating them with a canonical tag or merging the content into a single authoritative page.",
  },
  DUPLICATE_DESCRIPTION: {
    title: "Duplicate Meta Description",
    howToFix:
      "Write a unique meta description for each page. Avoid using templates that produce identical descriptions across multiple pages.",
  },
  MISSING_H1: {
    title: "Missing H1 Heading",
    howToFix:
      "Add a single H1 heading that clearly describes the main topic of the page. Place it above the primary content and include relevant keywords naturally.",
  },
  MULTIPLE_H1: {
    title: "Multiple H1 Headings",
    howToFix:
      "Reduce the page to a single H1 heading. Convert additional H1 tags to H2 or H3 to establish a clear heading hierarchy.",
  },
  MISSING_ALT: {
    title: "Images Missing Alt Text",
    howToFix:
      "Add descriptive alt attributes to all <img> tags. Use concise text that describes the image content. For decorative images, use an empty alt=\"\" attribute.",
  },
  MISSING_CANONICAL: {
    title: "Missing Canonical Tag",
    howToFix:
      "Add a <link rel=\"canonical\" href=\"...\"> tag in the <head> pointing to the preferred URL for this page. This prevents duplicate content issues from URL variations.",
  },
  MISSING_ROBOTS: {
    title: "Missing robots.txt",
    howToFix:
      "Create a robots.txt file at the site root. At minimum, specify the User-agent and Sitemap directives. Use Disallow rules to block crawlers from admin or duplicate pages.",
  },
  MISSING_SITEMAP: {
    title: "Missing or Incomplete Sitemap",
    howToFix:
      "Create an XML sitemap listing all indexable pages and submit it to Google Search Console. Ensure every crawlable page is included in the sitemap.",
  },
  MISSING_SCHEMA: {
    title: "No Structured Data",
    howToFix:
      "Add JSON-LD structured data relevant to the page type (Article, Product, FAQPage, etc.). Validate with Google's Rich Results Test before deploying.",
  },
  SLOW_PAGE: {
    title: "Slow Page Response",
    howToFix:
      "Reduce server response time by enabling caching, optimizing database queries, and using a CDN. Aim for a server response time under 200ms and total load under 3 seconds.",
  },
  MIXED_CONTENT: {
    title: "Mixed Content (HTTP on HTTPS)",
    howToFix:
      "Update all resource URLs (images, scripts, stylesheets) to use HTTPS. Use protocol-relative URLs or enforce HTTPS via Content-Security-Policy headers.",
  },
  LARGE_PAGE: {
    title: "Large HTML Payload",
    howToFix:
      "Reduce the HTML payload by removing inline CSS/JS, deferring non-critical resources, lazy-loading images, and minifying the HTML output. Aim for under 3 MB per page.",
  },
};
