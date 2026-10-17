import { Prisma, type PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Disconnect Google and delete the account, on the real Prisma client (PGlite).
// Only Google's revoke endpoint (fetch) is faked.

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
const stopCrawls = vi.hoisted(() => vi.fn(() => 0));
vi.mock("@/lib/db", async () => {
  const { lazyDb } = await import("@/lib/testing/pglite");
  return { db: lazyDb(holder) };
});
vi.mock("@/lib/crawler/lifecycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crawler/lifecycle")>()),
  stopCrawls,
}));

import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { sealGoogleTokens } from "@/lib/google/token-store";
import { isSignInAllowed } from "@/lib/registration";
import { deleteAccount, disconnectGoogle, GOOGLE_REVOKE_URL } from "./account";

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
  t = await createTestDb();
  db = holder.db = t.db;
}, 120_000);

afterAll(async () => {
  await t?.close();
});

const savedRegistration = process.env.DISABLE_REGISTRATION;
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedRegistration === undefined) delete process.env.DISABLE_REGISTRATION;
  else process.env.DISABLE_REGISTRATION = savedRegistration;
});

beforeEach(async () => {
  await db.user.deleteMany();
  stopCrawls.mockClear();
});

/** A user with a Google account, a session, an API key and one site with a row in every site table. */
async function seedUser(id: string) {
  await db.user.create({
    data: {
      id,
      email: `${id}@quilltab.app`,
      googleTokens: sealGoogleTokens({ accessToken: `ya29.${id}`, refreshToken: `1//${id}`, scope: "openid" }),
    },
  });
  await db.account.create({
    data: {
      userId: id,
      type: "oidc",
      provider: "google",
      providerAccountId: `g-${id}`,
      access_token: `ya29.${id}`,
      refresh_token: `1//${id}`,
      id_token: "jwt",
      expires_at: 1_800_000_000,
    },
  });
  await db.session.create({ data: { userId: id, sessionToken: `s-${id}`, expires: new Date(Date.now() + 86_400_000) } });
  await db.apiKey.create({ data: { userId: id, provider: "bing", encryptedPassword: "x" } });

  const siteId = `site-${id}`;
  const date = new Date("2026-10-01T00:00:00Z");
  await db.site.create({ data: { id: siteId, userId: id, domain: `${id}.example` } });
  await db.keyword.create({ data: { siteId, query: "q", date } });
  await db.page.create({ data: { siteId, url: "https://x/", date } });
  await db.bingDaily.create({ data: { siteId, date } });
  await db.bingSearchWeekly.create({ data: { siteId, kind: "query", key: "q", weekEnding: date } });
  await db.savedKeyword.create({ data: { siteId, query: "q" } });
  await db.rankSnapshot.create({ data: { siteId, query: "q", position: 1, date } });
  await db.vitalsReport.create({ data: { siteId, url: "https://x/", device: "MOBILE" } });
  await db.alert.create({ data: { userId: id, siteId, type: "NEW_404", channel: "EMAIL", config: {} } });
  const crawlId = `crawl-${id}`;
  await db.crawl.create({ data: { id: crawlId, siteId, status: "RUNNING", startedAt: new Date(), lastProgressAt: new Date() } });
  await db.auditPage.create({ data: { crawlId, url: "https://x/", statusCode: 200 } });
  await db.auditLink.create({ data: { crawlId, sourceUrl: "https://x/", targetUrl: "https://x/a" } });
  await db.crawlIssue.create({ data: { crawlId, url: "https://x/", type: "MISSING_H1", severity: "WARNING", message: "m" } });
}

/** Rows per model that belong to the user, through userId or their sites and crawls. */
async function rowsOf(userId: string): Promise<Record<string, number>> {
  const site = { site: { userId } };
  const crawl = { crawl: { site: { userId } } };
  return {
    user: await db.user.count({ where: { id: userId } }),
    account: await db.account.count({ where: { userId } }),
    session: await db.session.count({ where: { userId } }),
    apiKey: await db.apiKey.count({ where: { userId } }),
    alert: await db.alert.count({ where: { userId } }),
    site: await db.site.count({ where: { userId } }),
    keyword: await db.keyword.count({ where: site }),
    page: await db.page.count({ where: site }),
    bingDaily: await db.bingDaily.count({ where: site }),
    bingSearchWeekly: await db.bingSearchWeekly.count({ where: site }),
    savedKeyword: await db.savedKeyword.count({ where: site }),
    rankSnapshot: await db.rankSnapshot.count({ where: site }),
    vitalsReport: await db.vitalsReport.count({ where: site }),
    crawl: await db.crawl.count({ where: site }),
    auditPage: await db.auditPage.count({ where: crawl }),
    auditLink: await db.auditLink.count({ where: crawl }),
    crawlIssue: await db.crawlIssue.count({ where: crawl }),
  };
}

function revokeMock(ok = true) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(GOOGLE_REVOKE_URL);
    calls.push((init.body as URLSearchParams).get("token") ?? "");
    return new Response(ok ? "" : '{"error":"invalid_token"}', { status: ok ? 200 : 400 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

describe("disconnectGoogle", () => {
  it("revokes the refresh token, clears the tokens on User and Account and keeps the Account row", async () => {
    await seedUser("u1");
    const { calls } = revokeMock();

    expect(await disconnectGoogle(db, "u1")).toEqual({ revoked: true });

    expect(calls).toEqual(["1//u1"]);
    expect((await db.user.findUniqueOrThrow({ where: { id: "u1" } })).googleTokens).toBeNull();
    const account = await db.account.findFirstOrThrow({ where: { userId: "u1" } });
    expect(account).toMatchObject({ access_token: null, refresh_token: null, providerAccountId: "g-u1" });
    // Every session ends, not only the one that asked.
    expect(await db.session.count({ where: { userId: "u1" } })).toBe(0);
  });

  it("still lets the user sign in again with registration closed", async () => {
    await seedUser("u1");
    revokeMock();
    await disconnectGoogle(db, "u1");

    process.env.DISABLE_REGISTRATION = "true";
    expect(await isSignInAllowed({ provider: "google", providerAccountId: "g-u1" })).toBe(true);
  });

  it("clears the tokens when the revoke fails, and says so", async () => {
    await seedUser("u1");
    revokeMock(false);

    expect(await disconnectGoogle(db, "u1")).toEqual({ revoked: false });
    expect((await db.user.findUniqueOrThrow({ where: { id: "u1" } })).googleTokens).toBeNull();
    expect((await db.account.findFirstOrThrow({ where: { userId: "u1" } })).refresh_token).toBeNull();
  });

  it("clears the tokens when Google cannot be reached", async () => {
    await seedUser("u1");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));

    expect(await disconnectGoogle(db, "u1")).toEqual({ revoked: false });
    expect((await db.user.findUniqueOrThrow({ where: { id: "u1" } })).googleTokens).toBeNull();
  });

  it("falls back to the access token when there is no refresh token", async () => {
    await db.user.create({
      data: { id: "u5", email: "u5@quilltab.app", googleTokens: sealGoogleTokens({ accessToken: "ya29.only" }) },
    });
    const { calls } = revokeMock();

    await disconnectGoogle(db, "u5");
    expect(calls).toEqual(["ya29.only"]);
  });

  it("leaves another user's tokens alone", async () => {
    await seedUser("u1");
    await seedUser("u2");
    revokeMock();

    await disconnectGoogle(db, "u1");
    expect((await db.user.findUniqueOrThrow({ where: { id: "u2" } })).googleTokens).not.toBeNull();
    expect((await db.account.findFirstOrThrow({ where: { userId: "u2" } })).refresh_token).toBe("1//u2");
  });
});

describe("deleteAccount", () => {
  it("revokes first, stops the user's crawls, and deletes every row the user owns", async () => {
    await seedUser("u1");
    const before = await rowsOf("u1");
    expect(Object.values(before).every((n) => n > 0)).toBe(true);

    let userAtRevoke = -1;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      userAtRevoke = await db.user.count({ where: { id: "u1" } });
      expect((init.body as URLSearchParams).get("token")).toBe("1//u1");
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await deleteAccount(db, "u1")).toEqual({ revoked: true });

    expect(userAtRevoke).toBe(1);
    expect(stopCrawls).toHaveBeenCalledWith(["crawl-u1"], expect.any(String));
    expect(Object.values(await rowsOf("u1")).every((n) => n === 0)).toBe(true);
  });

  it("leaves a second user's data untouched", async () => {
    await seedUser("u1");
    await seedUser("u2");
    const before = await rowsOf("u2");
    revokeMock();

    await deleteAccount(db, "u1");
    expect(await rowsOf("u2")).toEqual(before);
  });

  it("deletes the account when the revoke fails", async () => {
    await seedUser("u1");
    revokeMock(false);

    expect(await deleteAccount(db, "u1")).toEqual({ revoked: false });
    expect(await db.user.count({ where: { id: "u1" } })).toBe(0);
  });
});

describe("schema", () => {
  // Every table except Auth.js's VerificationToken, WorkerHeartbeat (one row
  // per job-processing process) and SchedulerState (the scheduler's own
  // timestamps), which hold no user data, hangs off User through required
  // relations that cascade, so deleting the User deletes it. A new model that
  // does not fails here.
  it("every model cascades from User", () => {
    const models = Prisma.dmmf.datamodel.models;
    const byName = new Map(models.map((m) => [m.name, m]));
    const reaches = (name: string, seen = new Set<string>()): boolean => {
      if (name === "User") return true;
      if (seen.has(name)) return false;
      seen.add(name);
      const model = byName.get(name)!;
      return model.fields.some(
        (f) =>
          f.kind === "object" &&
          f.relationFromFields?.length &&
          f.isRequired &&
          f.relationOnDelete === "Cascade" &&
          reaches(f.type, seen)
      );
    };
    const orphans = models.map((m) => m.name).filter((n) => !["VerificationToken", "WorkerHeartbeat", "SchedulerState"].includes(n) && !reaches(n));
    expect(orphans).toEqual([]);
  });
});
