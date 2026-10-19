import { BlockList, isIPv4, isIPv6 } from "net";
import { Agent } from "undici";
import { BlockedAddressError, checkedAddresses, isPrivateIp, pinnedLookupWith, type AddressRule } from "@/lib/crawler/engine";
import { allowPrivateWebhooks } from "./config";

/*
 * Where an alert webhook may be sent. The crawler's SSRF guard applies: a
 * name that resolves to a private or reserved address is refused, checked
 * again on every connection (pinned lookup, so DNS rebinding cannot get
 * around it), and redirects are never followed.
 *
 * ALERT_WEBHOOK_ALLOW_PRIVATE=true (self-hosted installs, set by the
 * operator, not by a user) also allows the private networks below, for a
 * receiver on the same network such as n8n in the same Docker network.
 * Link-local (cloud metadata at 169.254.169.254), unspecified, multicast and
 * reserved addresses stay blocked either way.
 */

const PRIVATE_NETWORKS = new BlockList();
for (const [net, prefix] of [
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // shared address space (CGNAT, Tailscale)
  ["127.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
] as const) {
  PRIVATE_NETWORKS.addSubnet(net, prefix, "ipv4");
}
PRIVATE_NETWORKS.addAddress("::1", "ipv6");
PRIVATE_NETWORKS.addSubnet("fc00::", 7, "ipv6"); // unique local

/** A private network address the opt-in allows. */
export function isPrivateNetworkIp(ip: string): boolean {
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) return isPrivateNetworkIp(v4mapped[1]);
  if (isIPv4(ip)) return PRIVATE_NETWORKS.check(ip, "ipv4");
  if (isIPv6(ip)) return PRIVATE_NETWORKS.check(ip, "ipv6");
  return false;
}

/** The address rule of webhook connections. */
export function webhookAddressRule(allowPrivate: boolean): AddressRule {
  return (ip) => isPrivateIp(ip) && !(allowPrivate && isPrivateNetworkIp(ip));
}

export class InvalidWebhookUrlError extends Error {
  /** True when waiting can fix it: a name that does not resolve now may resolve later. */
  readonly transient: boolean;

  constructor(message: string, opts: { transient?: boolean } = {}) {
    super(message);
    this.name = "InvalidWebhookUrlError";
    this.transient = opts.transient ?? false;
  }
}

/** The longest URL a webhook may have. */
export const MAX_WEBHOOK_URL_LENGTH = 2000;

/** The URL in the form it is stored and sent to, or an InvalidWebhookUrlError saying what is wrong. */
export function parseWebhookUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) throw new InvalidWebhookUrlError("Enter the webhook URL.");
  const text = raw.trim();
  if (text.length > MAX_WEBHOOK_URL_LENGTH) {
    throw new InvalidWebhookUrlError(`The URL is longer than ${MAX_WEBHOOK_URL_LENGTH} characters.`);
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new InvalidWebhookUrlError("This is not a valid URL. It starts with https:// or http://.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InvalidWebhookUrlError("The URL must start with https:// or http://.");
  }
  if (url.username || url.password) {
    throw new InvalidWebhookUrlError("Leave the user name and password out of the URL. Deliveries are signed with the secret.");
  }
  url.hash = "";
  return url;
}

/** URL.hostname keeps the brackets of an IPv6 literal; the resolver wants it bare. */
function bareHost(url: URL): string {
  const host = url.hostname;
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * Checks that the URL's host resolves only to addresses a webhook may reach.
 * Throws an InvalidWebhookUrlError with the reason.
 */
export async function assertWebhookTarget(url: URL, allowPrivate: boolean = allowPrivateWebhooks()): Promise<void> {
  try {
    await checkedAddresses(bareHost(url), webhookAddressRule(allowPrivate));
  } catch (err) {
    if (!(err instanceof BlockedAddressError)) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
        throw new InvalidWebhookUrlError(`${url.hostname} does not resolve. Check the host name.`, { transient: true });
      }
      throw new InvalidWebhookUrlError(`Could not resolve ${url.hostname}: ${(err as Error).message}`, { transient: true });
    }
    throw new InvalidWebhookUrlError(
      allowPrivate
        ? `${url.hostname} resolves to a link-local or reserved address. Webhooks cannot be sent there.`
        : `${url.hostname} resolves to a private or reserved address. Webhooks go to public addresses only, unless the server sets ALERT_WEBHOOK_ALLOW_PRIVATE=true.`
    );
  }
}

const dispatchers = new Map<boolean, Agent>();

/** The dispatcher of webhook requests: every connection's addresses are checked again. */
export function webhookDispatcher(allowPrivate: boolean = allowPrivateWebhooks()): Agent {
  let agent = dispatchers.get(allowPrivate);
  if (!agent) {
    agent = new Agent({ connect: { lookup: pinnedLookupWith(webhookAddressRule(allowPrivate)) } });
    dispatchers.set(allowPrivate, agent);
  }
  return agent;
}
