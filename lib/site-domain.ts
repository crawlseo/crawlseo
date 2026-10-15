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

/**
 * The domain a provider like DataForSEO looks up: the hostname without a
 * leading `www.`. Used for both the stored site and a typed comparison, so the
 * two compare equal when they name the same site.
 */
export function comparableDomain(value: string): string | null {
  return siteDomainFromProperty(value)?.toLowerCase().replace(/^www\./, "") || null;
}

// Special-use, reserved and never-delegated top-level names (RFC 2606,
// RFC 6761, RFC 6762, RFC 7686, RFC 8375, RFC 9476, ICANN's .internal, and
// names ICANN will not delegate). They never have public search data.
const RESERVED_TLDS = new Set([
  "local", "localhost", "test", "invalid", "example", "internal",
  "arpa", "onion", "alt", "home", "corp", "mail", "lan",
]);
const LABEL = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/;
// A top-level name is letters or punycode, never digits: this also refuses
// every IPv4 address, which URL parsing has already turned into a dotted quad.
const TLD = /^([a-z]{2,63}|xn--[a-z0-9-]+)$/;

/**
 * True for a public, multi-label domain name. False for localhost, IP
 * addresses, single-label names, malformed labels and reserved top-level
 * names.
 */
export function isPublicDomainName(hostname: string): boolean {
  const labels = hostname.toLowerCase().split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return false;
  const tld = labels[labels.length - 1];
  return TLD.test(tld) && !RESERVED_TLDS.has(tld);
}
