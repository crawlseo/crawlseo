/*
 * Alert webhook settings from the environment. A user sets the URL and the
 * secret in Settings; these are the server's limits on it.
 */

type Env = Record<string, string | undefined>;

/** ALERT_WEBHOOKS_ENABLED=false turns webhooks off on this server: nothing is sent, Settings shows no form. */
export function webhooksEnabled(env: Env = process.env): boolean {
  return env.ALERT_WEBHOOKS_ENABLED?.trim().toLowerCase() !== "false";
}

/** ALERT_WEBHOOK_ALLOW_PRIVATE=true lets webhooks reach private networks (lib/webhooks/address.ts). */
export function allowPrivateWebhooks(env: Env = process.env): boolean {
  return env.ALERT_WEBHOOK_ALLOW_PRIVATE?.trim().toLowerCase() === "true";
}
