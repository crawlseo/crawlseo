import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { encryptStoredGoogleTokens, reportLines } from "./encrypt-stored-tokens";
import { isSealed, openGoogleTokens, sealGoogleTokens } from "./token-store";

// The migration behind scripts/encrypt-google-tokens.ts, on PGlite.

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
  t = await createTestDb();
  db = t.db;

  // Legacy: plain tokens on the user and on the Account row.
  await db.user.create({
    data: { id: "legacy", email: "legacy@quilltab.app", googleTokens: { accessToken: "ya29.a", refreshToken: "1//r", scope: "openid" } },
  });
  await db.account.create({
    data: { userId: "legacy", type: "oidc", provider: "google", providerAccountId: "g-legacy", access_token: "ya29.a", refresh_token: "1//r" },
  });
  // Already encrypted.
  await db.user.create({
    data: { id: "sealed", email: "sealed@quilltab.app", googleTokens: sealGoogleTokens({ accessToken: "ya29.s", refreshToken: "1//s" }) },
  });
  // The Account row holds the only copy: googleTokens is empty.
  await db.user.create({ data: { id: "only-account", email: "only@quilltab.app" } });
  await db.account.create({
    data: { userId: "only-account", type: "oidc", provider: "google", providerAccountId: "g-only", refresh_token: "1//only" },
  });
}, 120_000);

afterAll(async () => {
  await t?.close();
});

const tokensOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).googleTokens;
const accountOf = (providerAccountId: string) =>
  db.account.findFirstOrThrow({ where: { providerAccountId } });

describe("encryptStoredGoogleTokens", () => {
  it("dry run reports and writes nothing", async () => {
    const report = await encryptStoredGoogleTokens(db, { apply: false });

    expect(report).toEqual({
      users: 2,
      plainUsers: 1,
      accountsWithTokens: 2,
      accountsCleared: 1,
      accountsKept: 1,
      applied: false,
    });
    expect(isSealed(await tokensOf("legacy"))).toBe(false);
    expect((await accountOf("g-legacy")).refresh_token).toBe("1//r");
  });

  it("--apply encrypts and clears the duplicate Account tokens", async () => {
    const report = await encryptStoredGoogleTokens(db, { apply: true });
    expect(report).toMatchObject({ plainUsers: 1, accountsCleared: 1, accountsKept: 1, applied: true });

    const legacy = await tokensOf("legacy");
    expect(isSealed(legacy)).toBe(true);
    expect(openGoogleTokens(legacy)).toEqual({ accessToken: "ya29.a", refreshToken: "1//r", scope: "openid" });
    expect(await accountOf("g-legacy")).toMatchObject({ access_token: null, refresh_token: null });
    // The only copy is kept.
    expect((await accountOf("g-only")).refresh_token).toBe("1//only");
  });

  it("a second run is a no-op", async () => {
    const before = await tokensOf("legacy");
    const report = await encryptStoredGoogleTokens(db, { apply: true });

    expect(report).toMatchObject({ plainUsers: 0, accountsCleared: 0, accountsKept: 1 });
    expect(await tokensOf("legacy")).toEqual(before);
  });
});

describe("report", () => {
  it("says a dry run is one and prints counts only", () => {
    const lines = reportLines({
      users: 2,
      plainUsers: 1,
      accountsWithTokens: 2,
      accountsCleared: 1,
      accountsKept: 1,
      applied: false,
    });
    expect(lines[0]).toMatch(/^Dry run, nothing written/);
    expect(lines).toContain("  plain text, would be encrypted: 1");
  });
});
