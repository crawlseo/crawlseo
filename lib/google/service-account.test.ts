import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "crypto";
import {
  getServiceAccountAccessToken,
  isServiceAccountConfigured,
  ServiceAccountConfigError,
  __resetServiceAccountCache,
} from "./service-account";

vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLIENT_EMAIL = "svc-account@my-project.iam.gserviceaccount.com";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function generateRsaKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

function setKeyEnv(privateKey: string, clientEmail = CLIENT_EMAIL) {
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
    client_email: clientEmail,
    private_key: privateKey,
  });
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Extracts the request the mocked fetch was called with, for assertions. */
function fetchCallArgs(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

/** Splits the signed JWT-bearer assertion out of the mocked request body. */
function assertionFromInit(init: RequestInit): string {
  const params = init.body as URLSearchParams;
  return params.get("assertion") as string;
}

describe("service-account", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __resetServiceAccountCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  /* ------------------------------------------------------------------ */
  /* Configuration detection                                             */
  /* ------------------------------------------------------------------ */

  describe("isServiceAccountConfigured", () => {
    it("GIVEN GOOGLE_SERVICE_ACCOUNT_KEY is unset WHEN checked THEN returns false", () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      expect(isServiceAccountConfigured()).toBe(false);
    });

    it("GIVEN GOOGLE_SERVICE_ACCOUNT_KEY is set WHEN checked THEN returns true", () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = "anything";
      expect(isServiceAccountConfigured()).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Key loading                                                         */
  /* ------------------------------------------------------------------ */

  describe("key loading", () => {
    it("GIVEN GOOGLE_SERVICE_ACCOUNT_KEY is unset WHEN getServiceAccountAccessToken is called THEN it rejects with ServiceAccountConfigError", async () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      await expect(getServiceAccountAccessToken()).rejects.toBeInstanceOf(
        ServiceAccountConfigError
      );
    });

    it("GIVEN GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON WHEN getServiceAccountAccessToken is called THEN it rejects with ServiceAccountConfigError", async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = "not-json{{{";
      await expect(getServiceAccountAccessToken()).rejects.toBeInstanceOf(
        ServiceAccountConfigError
      );
    });

    it("GIVEN valid JSON missing client_email WHEN getServiceAccountAccessToken is called THEN it rejects with ServiceAccountConfigError", async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        private_key: "some-key",
      });
      await expect(getServiceAccountAccessToken()).rejects.toBeInstanceOf(
        ServiceAccountConfigError
      );
    });

    it("GIVEN valid JSON missing private_key WHEN getServiceAccountAccessToken is called THEN it rejects with ServiceAccountConfigError", async () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        client_email: CLIENT_EMAIL,
      });
      await expect(getServiceAccountAccessToken()).rejects.toBeInstanceOf(
        ServiceAccountConfigError
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /* The JWT assertion                                                   */
  /* ------------------------------------------------------------------ */

  describe("the JWT assertion", () => {
    it("GIVEN a configured service account WHEN a token is requested THEN the POST goes to https://oauth2.googleapis.com/token", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { url } = fetchCallArgs(fetchMock);
      expect(url).toBe(OAUTH_TOKEN_URL);
    });

    it("GIVEN a configured service account WHEN a token is requested THEN the request body carries grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const params = init.body as URLSearchParams;
      expect(params.get("grant_type")).toBe(
        "urn:ietf:params:oauth:grant-type:jwt-bearer"
      );
    });

    it("GIVEN a configured service account WHEN a token is requested THEN the assertion is three dot-separated base64url segments", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const assertion = assertionFromInit(init);
      const segments = assertion.split(".");
      expect(segments).toHaveLength(3);
    });

    it("GIVEN a configured service account WHEN a token is requested THEN decoding the assertion's header yields exactly {alg: RS256, typ: JWT}", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const [headerSegment] = assertionFromInit(init).split(".");
      expect(decodeSegment(headerSegment)).toEqual({
        alg: "RS256",
        typ: "JWT",
      });
    });

    it("GIVEN a configured service account WHEN a token is requested THEN decoding its claims yields iss equal to the key's client_email", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const [, claimsSegment] = assertionFromInit(init).split(".");
      const claims = decodeSegment(claimsSegment) as Record<string, unknown>;
      expect(claims.iss).toBe(CLIENT_EMAIL);
    });

    it("GIVEN a configured service account WHEN a token is requested THEN claims.scope is exactly the webmasters.readonly scope", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const [, claimsSegment] = assertionFromInit(init).split(".");
      const claims = decodeSegment(claimsSegment) as Record<string, unknown>;
      expect(claims.scope).toBe(
        "https://www.googleapis.com/auth/webmasters.readonly"
      );
    });

    it("GIVEN a configured service account WHEN a token is requested THEN claims.aud is exactly the token URL", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const [, claimsSegment] = assertionFromInit(init).split(".");
      const claims = decodeSegment(claimsSegment) as Record<string, unknown>;
      expect(claims.aud).toBe(OAUTH_TOKEN_URL);
    });

    it("GIVEN a configured service account WHEN a token is requested THEN claims.exp is exactly iat + 3600", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const [, claimsSegment] = assertionFromInit(init).split(".");
      const claims = decodeSegment(claimsSegment) as {
        iat: number;
        exp: number;
      };
      expect(claims.exp).toBe(claims.iat + 3600);
    });

    it("GIVEN a real RSA keypair WHEN a token is requested THEN the assertion's signature verifies against the public key", async () => {
      const { publicKey, privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const assertion = assertionFromInit(init);
      const [headerSegment, claimsSegment, signatureSegment] =
        assertion.split(".");
      const signingInput = `${headerSegment}.${claimsSegment}`;
      const signature = Buffer.from(signatureSegment, "base64url");

      const verifier = createVerify("RSA-SHA256");
      verifier.update(signingInput);
      verifier.end();

      expect(verifier.verify(publicKey, signature)).toBe(true);
    });

    it("GIVEN a private_key with literal \\n two-character sequences WHEN a token is requested THEN it is normalised and still signs successfully", async () => {
      const { publicKey, privateKey } = generateRsaKeyPair();
      const envStylePrivateKey = privateKey.replace(/\n/g, "\\n");
      setKeyEnv(envStylePrivateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "tok",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();

      const { init } = fetchCallArgs(fetchMock);
      const assertion = assertionFromInit(init);
      const [headerSegment, claimsSegment, signatureSegment] =
        assertion.split(".");
      const signingInput = `${headerSegment}.${claimsSegment}`;
      const signature = Buffer.from(signatureSegment, "base64url");

      const verifier = createVerify("RSA-SHA256");
      verifier.update(signingInput);
      verifier.end();

      expect(verifier.verify(publicKey, signature)).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Token handling                                                      */
  /* ------------------------------------------------------------------ */

  describe("token handling", () => {
    it("GIVEN a successful token exchange WHEN getServiceAccountAccessToken resolves THEN the returned value is exactly the access_token from the response", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      mockFetchOnce(200, { access_token: "the-exact-token", expires_in: 3600 });

      const token = await getServiceAccountAccessToken();

      expect(token).toBe("the-exact-token");
    });

    it("GIVEN a token was already fetched within its validity window WHEN getServiceAccountAccessToken is called again THEN fetch is called exactly once", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      const fetchMock = mockFetchOnce(200, {
        access_token: "cached-token",
        expires_in: 3600,
      });

      await getServiceAccountAccessToken();
      await getServiceAccountAccessToken();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("GIVEN a token is cached WHEN the credential is rotated within the validity window THEN a new token is fetched rather than the previous account's being reused", async () => {
      // The quiet failure this guards: a bare module-level cache would keep
      // serving a token minted for the PREVIOUS service account after a key
      // rotation, succeeding with nothing in the logs to show the new
      // credential was never exercised.
      const first = generateRsaKeyPair();
      setKeyEnv(first.privateKey, "first@project.iam.gserviceaccount.com");
      const fetchMock = mockFetchOnce(200, {
        access_token: "first-account-token",
        expires_in: 3600,
      });
      await getServiceAccountAccessToken();

      const second = generateRsaKeyPair();
      setKeyEnv(second.privateKey, "second@project.iam.gserviceaccount.com");
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          access_token: "second-account-token",
          expires_in: 3600,
        }),
      } as Response);

      const token = await getServiceAccountAccessToken();

      expect(token).toBe("second-account-token");
    });

    it("GIVEN the token endpoint responds non-ok WHEN getServiceAccountAccessToken is called THEN it rejects with a message containing the client_email", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      mockFetchOnce(403, { error: "permission_denied" });

      await expect(getServiceAccountAccessToken()).rejects.toThrow(
        new RegExp(CLIENT_EMAIL.replace(/[.]/g, "\\."))
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /* Precedence in google-auth.ts                                        */
  /* ------------------------------------------------------------------ */

  describe("precedence in google-auth.ts", () => {
    it("GIVEN a service account is configured WHEN getAccessToken(userId) is called THEN it returns the service-account token and does not touch the database", async () => {
      const { privateKey } = generateRsaKeyPair();
      setKeyEnv(privateKey);
      mockFetchOnce(200, {
        access_token: "service-account-token",
        expires_in: 3600,
      });

      const { db } = await import("@/lib/db");
      const { getAccessToken } = await import("./google-auth");

      const token = await getAccessToken("any-user");

      expect(token).toBe("service-account-token");
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
