import type { Redirect } from "next/dist/lib/load-custom-routes";

/**
 * Old app paths that moved. permanent: true answers 308, so old bookmarks and
 * the installed PWA start URL keep working.
 */
export const APP_REDIRECTS: Redirect[] = [
  // Dashboard and Sites became one home, All sites.
  { source: "/dashboard", destination: "/sites", permanent: true },
];
