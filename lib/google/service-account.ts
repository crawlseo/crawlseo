/**
 * Service-account authentication for the Google Search Console API.
 *
 * WHY THIS EXISTS
 * ---------------
 * Upstream CrawlSEO authenticates every Google call with a per-user OAuth
 * refresh token. That works for its intended audience — one founder clicking
 * "connect my account" — but it carries two costs we hit immediately:
 *
 *   1. While the OAuth app's publishing status is "Testing", ONLY accounts on
 *      the consent screen's test-user list can complete the flow. That list is
 *      capped at 100 and every entry is added by hand in the Google console.
 *      Schatzi-AI#26 has been blocked on exactly one such click since
 *      2026-09-07, with the whole SEO and measurement lane frozen behind it.
 *   2. Refresh tokens expire. `ReauthRequiredError` in ./google-auth is a human
 *      being re-consenting in a browser — fine for a dashboard, wrong for a
 *      scheduled agent run that nobody is watching.
 *
 * Search Console's own permission model has no such problem: a service account
 * is added as a USER on a property, exactly like a colleague. No consent
 * screen, no test-user list, no re-consent, and it scales to every property at
 * once rather than one consenting human at a time.
 *
 * NO NEW DEPENDENCY. This repo carries no Google client library, and a pinned
 * security-relevant fork is the wrong place to add one. The JWT-bearer grant
 * (RFC 7523, which is all `google-auth-library` does for this case) is ~40
 * lines against Node's built-in `crypto`.
 *
 * This file adds a capability and changes no existing behaviour: with
 * GOOGLE_SERVICE_ACCOUNT_KEY unset, nothing here runs.
 */

import { createHash, createSign } from "crypto";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

/**
 * Read-only. The service account can read Search Console data and can change
 * nothing — narrower than the OAuth flow's scope, and deliberately so: this
 * credential is long-lived and unattended, which is precisely when least
 * privilege matters most.
 */
const GSC_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** Refresh this long before expiry, matching ./google-auth's 5-minute margin. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export class ServiceAccountConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceAccountConfigError";
  }
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/**
 * The cache is keyed by a fingerprint of the credential, not held globally.
 *
 * A bare module-level token would survive a key rotation: swap
 * GOOGLE_SERVICE_ACCOUNT_KEY and, for up to the remaining validity window, every
 * call still returns a token minted for the PREVIOUS account — succeeding, with
 * nothing in the logs to say the new credential was never exercised. Rare in
 * production, where env vars change only on restart, and exactly the kind of
 * assumption that fails quietly when it does happen.
 *
 * The fingerprint is a SHA-256 of the raw env value, so rotating the private key
 * for the SAME client_email also invalidates. No key material is retained.
 */
let cachedToken: {
  accessToken: string;
  expiresAt: number;
  fingerprint: string;
} | null = null;

function fingerprint(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Exported for tests. Never call this from application code. */
export function __resetServiceAccountCache(): void {
  cachedToken = null;
}

/**
 * True when a service-account key is configured. Callers use this to decide
 * which auth path to take, so the decision is explicit rather than a silent
 * fallback on a thrown error.
 */
export function isServiceAccountConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

function loadKey(): ServiceAccountKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new ServiceAccountConfigError(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not set"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ServiceAccountConfigError(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. Store the whole service " +
        "account key blob as one value, not a file path."
    );
  }

  const key = parsed as Partial<ServiceAccountKey>;
  if (!key.client_email || !key.private_key) {
    throw new ServiceAccountConfigError(
      "GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email or private_key. " +
        "Use the JSON Google issued for the service account, unmodified."
    );
  }

  return {
    client_email: key.client_email,
    // Keys pasted through an env file arrive with literal \n rather than real
    // newlines, and PEM parsing then fails with a message that says nothing
    // about newlines. Normalising here costs nothing and removes an hour of
    // confusion. A key with real newlines is unaffected.
    private_key: key.private_key.replace(/\\n/g, "\n"),
  };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Build and RS256-sign the assertion Google exchanges for an access token. */
function signAssertion(key: ServiceAccountKey, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: GSC_READONLY_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    })
  );

  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();

  return `${signingInput}.${base64url(signer.sign(key.private_key))}`;
}

/**
 * A Search Console access token for the configured service account.
 *
 * Cached until shortly before expiry: the assertion exchange is a network round
 * trip, and gsc-client calls this per request.
 */
export async function getServiceAccountAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const currentFingerprint = raw ? fingerprint(raw) : null;

  if (
    cachedToken &&
    cachedToken.fingerprint === currentFingerprint &&
    cachedToken.expiresAt - Date.now() > EXPIRY_MARGIN_MS
  ) {
    return cachedToken.accessToken;
  }

  const key = loadKey();
  const assertion = signAssertion(key, Math.floor(Date.now() / 1000));

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: JWT_BEARER_GRANT,
      assertion,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Service account token exchange failed: ${response.status} ` +
        `${response.statusText}${body ? ` — ${body.slice(0, 500)}` : ""}. ` +
        `Check that ${key.client_email} has been added as a user on the ` +
        `Search Console property.`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    // Recomputed from the value loadKey() actually used, not from the snapshot
    // above, so the cache can never be tagged with a credential that was not
    // the one signed with.
    fingerprint: fingerprint(process.env.GOOGLE_SERVICE_ACCOUNT_KEY as string),
  };

  return cachedToken.accessToken;
}
