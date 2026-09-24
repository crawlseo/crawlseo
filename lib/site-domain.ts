/**
 * Derives the bare hostname a Site is stored under from a Search Console
 * property (or a domain typed by hand).
 *
 *   sc-domain:example.com        -> example.com
 *   https://www.example.com/     -> www.example.com
 *   https://example.com/blog/    -> example.com
 *   example.com/                 -> example.com
 *
 * `www.` is kept: a URL-prefix property for www.example.com is a different
 * site than example.com as far as GSC is concerned. Everything downstream
 * builds URLs as `https://${site.domain}`, so no scheme, port, path or
 * trailing slash may survive.
 *
 * Returns null when no hostname can be derived.
 */
export function siteDomainFromProperty(property: string): string | null {
  const value = property.trim();
  if (!value) return null;

  let candidate: string;
  if (/^sc-domain:/i.test(value)) {
    candidate = `https://${value.slice("sc-domain:".length)}`;
  } else if (/^https?:\/\//i.test(value)) {
    candidate = value;
  } else {
    candidate = `https://${value.replace(/^\/+/, "")}`;
  }

  let hostname: string;
  try {
    hostname = new URL(candidate).hostname;
  } catch {
    return null;
  }

  // "example.com." is the same host as "example.com"
  hostname = hostname.replace(/\.$/, "");
  return hostname || null;
}
