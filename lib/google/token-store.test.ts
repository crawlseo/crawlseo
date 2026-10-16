import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Encrypted Google tokens in User.googleTokens, on the real Prisma client
// (PGlite): the sign-in write, the refresh write and the legacy plain-text row.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { decrypt } from "@/lib/encryption";
import {
  ENCRYPTED_PREFIX,
  isSealed,
  openGoogleTokens,
  sealGoogleTokens,
  storeSignInTokens,
} from "./token-store";
import { getAccessToken } from "./google-auth";

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
  t = await createTestDb();
  db = holder.db = t.db;
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await t?.close();
});

beforeEach(async () => {
  await db.user.deleteMany();
  vi.unstubAllGlobals();
});

const stored = async (id: string) =>
  (await db.user.findUniqueOrThrow({ where: { id } })).googleTokens as Record<string, unknown>;

describe("seal / open", () => {
  it("round trips, with the tokens encrypted and the rest plain", () => {
    const tokens = {
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      expiresAt: 1_800_000_000_000,
      tokenType: "bearer",
      scope: "openid email",
    };
    const sealed = sealGoogleTokens(tokens) as Record<string, unknown>;

    expect(String(sealed.accessToken).startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(String(sealed.refreshToken).startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain("ya29.access");
    expect(JSON.stringify(sealed)).not.toContain("1//refresh");
    expect(sealed.scope).toBe("openid email");
    expect(isSealed(sealed)).toBe(true);
    expect(openGoogleTokens(sealed)).toEqual(tokens);
  });

  it("reads a legacy plain-text value as is", () => {
    const legacy = { accessToken: "ya29.plain", refreshToken: "1//plain", expiresAt: 5 };
    expect(isSealed(legacy)).toBe(false);
    expect(openGoogleTokens(legacy)).toEqual(legacy);
  });

  it("does not encrypt twice", () => {
    const once = sealGoogleTokens({ accessToken: "a" });
    const twice = sealGoogleTokens(once as { accessToken: string });
    expect(twice).toEqual(once);
  });
});

describe("sign-in", () => {
  it("stores the tokens encrypted and clears the Account row's copies, keeping the row", async () => {
    await db.user.create({ data: { id: "u1", email: "mike@quilltab.app" } });
    await db.account.create({
      data: {
        userId: "u1",
        type: "oidc",
        provider: "google",
        providerAccountId: "g-1",
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expires_at: 1_800_000_000,
      },
    });

    await storeSignInTokens(db, "mike@quilltab.app", {
      provider: "google",
      providerAccountId: "g-1",
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      expires_at: 1_800_000_000,
      token_type: "bearer",
      scope: "openid https://www.googleapis.com/auth/webmasters.readonly",
    });

    const tokens = await stored("u1");
    expect(JSON.stringify(tokens)).not.toMatch(/ya29\.access|1\/\/refresh/);
    expect(decrypt(String(tokens.refreshToken).slice(ENCRYPTED_PREFIX.length))).toBe("1//refresh");
    expect(tokens.expiresAt).toBe(1_800_000_000_000);

    const account = await db.account.findFirstOrThrow({ where: { userId: "u1" } });
    expect(account.access_token).toBeNull();
    expect(account.refresh_token).toBeNull();
    expect(account.providerAccountId).toBe("g-1");
  });
});

describe("getAccessToken", () => {
  it("reads a legacy plain-text row and writes it back encrypted on refresh", async () => {
    await db.user.create({
      data: {
        id: "u2",
        email: "legacy@quilltab.app",
        googleTokens: { accessToken: "ya29.old", refreshToken: "1//legacy", expiresAt: Date.now() - 1000, scope: "openid" },
      },
    });
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: "ya29.new", expires_in: 3600 })
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await getAccessToken("u2")).toBe("ya29.new");

    // The legacy refresh token was sent as read.
    const body = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("refresh_token")).toBe("1//legacy");

    const tokens = await stored("u2");
    expect(isSealed(tokens)).toBe(true);
    expect(JSON.stringify(tokens)).not.toMatch(/ya29\.new|1\/\/legacy/);
    expect(openGoogleTokens(tokens)).toMatchObject({
      accessToken: "ya29.new",
      refreshToken: "1//legacy",
      scope: "openid",
    });
  });

  it("returns a still-valid encrypted access token without refreshing", async () => {
    await db.user.create({
      data: {
        id: "u3",
        email: "fresh@quilltab.app",
        googleTokens: sealGoogleTokens({ accessToken: "ya29.valid", refreshToken: "1//r", expiresAt: Date.now() + 3_600_000 }),
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await getAccessToken("u3")).toBe("ya29.valid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for a new sign-in when the tokens no longer decrypt", async () => {
    await db.user.create({
      data: {
        id: "u4",
        email: "rotated@quilltab.app",
        googleTokens: { accessToken: `${ENCRYPTED_PREFIX}bad:bad:bad`, refreshToken: `${ENCRYPTED_PREFIX}bad:bad:bad` },
      },
    });
    await expect(getAccessToken("u4")).rejects.toMatchObject({ name: "ReauthRequiredError" });
  });
});
