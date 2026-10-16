import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import { syncGoogleProfile } from "./profile";

// The name and picture from the Google ID token, written on every sign-in, not only when the adapter
// creates the user.

let t: TestDb;
let db: PrismaClient;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
}, 120_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await db.user.deleteMany();
});

const user = (id: string) => db.user.findUniqueOrThrow({ where: { id }, select: { name: true, image: true } });

describe("syncGoogleProfile", () => {
  it("fills a name and picture the row was created without", async () => {
    await db.user.create({ data: { id: "u1", email: "mike@quilltab.app" } });
    await syncGoogleProfile(db, "mike@quilltab.app", { name: "Mike Gafin", picture: "https://lh3.googleusercontent.com/a/x" });
    expect(await user("u1")).toEqual({ name: "Mike Gafin", image: "https://lh3.googleusercontent.com/a/x" });
  });

  it("follows a name changed on Google", async () => {
    await db.user.create({ data: { id: "u1", email: "mike@quilltab.app", name: "Old", image: "https://a/1" } });
    await syncGoogleProfile(db, "mike@quilltab.app", { name: "New", picture: "https://a/1" });
    expect(await user("u1")).toEqual({ name: "New", image: "https://a/1" });
  });

  it("keeps the stored values when Google leaves the claims out", async () => {
    await db.user.create({ data: { id: "u1", email: "mike@quilltab.app", name: "Mike", image: "https://a/1" } });
    await syncGoogleProfile(db, "mike@quilltab.app", { name: "  " });
    await syncGoogleProfile(db, "mike@quilltab.app", undefined);
    expect(await user("u1")).toEqual({ name: "Mike", image: "https://a/1" });
  });

  it("does nothing for an unknown email", async () => {
    await expect(syncGoogleProfile(db, "nobody@quilltab.app", { name: "X" })).resolves.toBeUndefined();
  });
});
