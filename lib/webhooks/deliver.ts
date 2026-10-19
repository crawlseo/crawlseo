import { createHmac, randomBytes } from "crypto";
import type { AlertFire } from "@/lib/alerts/evaluate";
import { BlockedAddressError } from "@/lib/crawler/engine";
import { APP_VERSION } from "@/lib/version";
import { assertWebhookTarget, InvalidWebhookUrlError, parseWebhookUrl, webhookDispatcher } from "./address";

/*
 * Sends one alert webhook: a JSON POST to the user's own URL, signed with the
 * user's secret. One attempt per call; the job queue retries a delivery that
 * failed for a reason a retry can fix (lib/jobs/handlers.ts, alert-webhook).
 *
 * Headers of every delivery:
 *   X-Crawlseo-Event      alert.fired or test
 *   X-Crawlseo-Delivery   id of the delivery, the same on every retry
 *   X-Crawlseo-Timestamp  Unix time in seconds when this attempt was signed
 *   X-Crawlseo-Signature  sha256=<hex HMAC-SHA256 of "<timestamp>.<body>" with the secret>
 */

export const WEBHOOK_TIMEOUT_MS = 10_000;
export const MIN_SECRET_LENGTH = 16;
export const MAX_SECRET_LENGTH = 256;

export type WebhookEvent = "alert.fired" | "test";

/** The secret as it is stored, or an error message. Never trimmed: the receiver signs with the exact value. */
export function checkSecret(raw: unknown): { secret: string } | { error: string } {
  const secret = typeof raw === "string" ? raw : "";
  if (secret !== secret.trim()) return { error: "The secret starts or ends with a space or line break. Remove it." };
  if (secret.length < MIN_SECRET_LENGTH) return { error: `The secret needs at least ${MIN_SECRET_LENGTH} characters.` };
  if (secret.length > MAX_SECRET_LENGTH) return { error: `The secret can have at most ${MAX_SECRET_LENGTH} characters.` };
  return { secret };
}

/** The signature header value for a body signed at `timestamp` (Unix seconds). */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** The public base URL of the app, for links in the payload, or null. */
function appUrl(): string | null {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export type AlertDelivery = { fires: AlertFire[]; firedAt: string };

/**
 * An alert that keeps firing (a traffic drop lasts days, and each sync
 * evaluates again) goes to the webhook again only after this long: at most
 * once a day, with slack for a daily sync that runs a little earlier.
 */
export const WEBHOOK_REPEAT_AFTER_MS = 20 * 60 * 60_000;

/** The fires a webhook gets: those that did not fire within WEBHOOK_REPEAT_AFTER_MS before. */
export function firesToDeliver(fires: AlertFire[], now: Date = new Date()): AlertFire[] {
  return fires.filter((f) => {
    const previous = f.previousFiredAt ? Date.parse(f.previousFiredAt) : NaN;
    return Number.isNaN(previous) || now.getTime() - previous >= WEBHOOK_REPEAT_AFTER_MS;
  });
}

/** The body of an alert.fired delivery: every alert that fired for one site in one evaluation. */
export function alertPayload(deliveryId: string, delivery: AlertDelivery) {
  const first = delivery.fires[0];
  const base = appUrl();
  return {
    event: "alert.fired" as const,
    id: deliveryId,
    firedAt: delivery.firedAt,
    site: { id: first?.siteId ?? null, domain: first?.domain ?? null },
    alerts: delivery.fires.map((f) => ({
      id: f.alertId,
      type: f.type,
      message: f.message,
      previousFiredAt: f.previousFiredAt ?? null,
    })),
    url: base && first ? `${base}/sites/${first.siteId}/alerts` : null,
    crawlseo: { version: APP_VERSION },
  };
}

export function testPayload(deliveryId: string = `test_${randomBytes(8).toString("hex")}`) {
  return {
    event: "test" as const,
    id: deliveryId,
    firedAt: new Date().toISOString(),
    message: "Test delivery from crawlseo. Your webhook works.",
    crawlseo: { version: APP_VERSION },
  };
}

export type WebhookResult =
  | { ok: true; status: number }
  | {
      ok: false;
      /** HTTP status of the answer, if there was one. */
      status?: number;
      error: string;
      /** A later attempt may succeed: network error, timeout, 408, 425, 429 or 5xx. */
      retryable: boolean;
    };

const RETRYABLE_STATUS = new Set([408, 425, 429]);

/**
 * One POST of `payload` to `rawUrl`. Never throws: every failure comes back
 * with its reason and whether a retry can help.
 */
export async function sendWebhook(
  rawUrl: string,
  secret: string,
  event: WebhookEvent,
  payload: { id: string },
  opts: { allowPrivate?: boolean; timeoutMs?: number; now?: () => number } = {}
): Promise<WebhookResult> {
  let url: URL;
  try {
    url = parseWebhookUrl(rawUrl);
    await assertWebhookTarget(url, opts.allowPrivate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, retryable: err instanceof InvalidWebhookUrlError && err.transient };
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor((opts.now ?? Date.now)() / 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `crawlseo/${APP_VERSION}`,
        "X-Crawlseo-Event": event,
        "X-Crawlseo-Delivery": payload.id,
        "X-Crawlseo-Timestamp": String(timestamp),
        "X-Crawlseo-Signature": signWebhook(secret, timestamp, body),
      },
      body,
      signal: controller.signal,
      redirect: "manual",
      dispatcher: webhookDispatcher(opts.allowPrivate),
    } as RequestInit);
    await res.body?.cancel().catch(() => {});
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      return {
        ok: false,
        status: res.status,
        error: `The webhook answered with a redirect (HTTP ${res.status})${location ? ` to ${location}` : ""}. Redirects are not followed: set the final URL instead.`,
        retryable: false,
      };
    }
    return {
      ok: false,
      status: res.status,
      error: `The webhook answered HTTP ${res.status}.`,
      retryable: res.status >= 500 || RETRYABLE_STATUS.has(res.status),
    };
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, error: `The webhook did not answer within ${(opts.timeoutMs ?? WEBHOOK_TIMEOUT_MS) / 1000} s.`, retryable: true };
    }
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : null;
    // Refused at connect time: the name gained a blocked address after the check above.
    if (cause instanceof BlockedAddressError) {
      return { ok: false, error: `${url.hostname} resolves to an address webhooks cannot reach.`, retryable: false };
    }
    return {
      ok: false,
      error: `Could not reach the webhook: ${cause?.message ?? (err instanceof Error ? err.message : String(err))}`,
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
