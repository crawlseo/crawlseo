import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

// Runs the real migration chain in an in-process Postgres (PGlite), seeds the
// rows the old add-site modal produced, then applies the repair migration.

const MIGRATIONS_DIR = join(__dirname, "migrations");
const REPAIR = "20260924000000_repair_site_domain";

function migrationSql(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
}

const earlier = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name < REPAIR)
  .map((d) => d.name)
  .sort();

let db: PGlite;

async function seed(sites: Array<[id: string, userId: string, domain: string]>) {
  for (const [id, userId, domain] of sites) {
    await db.query(
      `INSERT INTO "User" ("id", "email", "updatedAt") VALUES ($1, $1 || '@test', now())
       ON CONFLICT DO NOTHING`,
      [userId]
    );
    // createdAt follows insertion order so the repair order is deterministic
    await db.query(
      `INSERT INTO "Site" ("id", "userId", "domain", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, clock_timestamp(), now())`,
      [id, userId, domain]
    );
  }
}

async function repair(): Promise<string[]> {
  const warnings: string[] = [];
  await db.exec(migrationSql(REPAIR), {
    onNotice: (n) => {
      if (n.severity === "WARNING") warnings.push(n.message ?? "");
    },
  });
  return warnings;
}

async function domains(): Promise<Record<string, string>> {
  const { rows } = await db.query<{ id: string; domain: string }>(
    `SELECT "id", "domain" FROM "Site" ORDER BY "id"`
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.domain]));
}

describe(`${REPAIR} migration`, () => {
  beforeEach(async () => {
    db = new PGlite();
    for (const name of earlier) await db.exec(migrationSql(name));
  });

  it("runs on an empty table", async () => {
    expect(await repair()).toEqual([]);
  });

  it("trims the leading // and trailing / from URL-prefix rows", async () => {
    await seed([
      ["s1", "u1", "//www.osnt.in/"],
      ["s2", "u1", "//example.com/blog/"],
      ["s3", "u1", "example.org/"],
    ]);
    expect(await repair()).toEqual([]);
    expect(await domains()).toEqual({
      s1: "www.osnt.in",
      s2: "example.com",
      s3: "example.org",
    });
  });

  it("leaves clean rows alone, www included", async () => {
    await seed([
      ["s1", "u1", "brandson.digital"],
      ["s2", "u1", "www.brandson.digital"],
    ]);
    await repair();
    expect(await domains()).toEqual({
      s1: "brandson.digital",
      s2: "www.brandson.digital",
    });
  });

  it("reports instead of failing when a clean duplicate already exists", async () => {
    await seed([
      ["clean", "u1", "www.osnt.in"],
      ["broken", "u1", "//www.osnt.in/"],
      // same hostname for a different user is not a conflict
      ["other", "u2", "//www.osnt.in/"],
    ]);
    const warnings = await repair();

    expect(await domains()).toEqual({
      clean: "www.osnt.in",
      broken: "//www.osnt.in/",
      other: "www.osnt.in",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Site broken");
    expect(warnings[0]).toContain("site clean already uses \"www.osnt.in\"");
  });

  it("repairs only the oldest of two broken rows that collapse to one hostname", async () => {
    await seed([
      ["first", "u1", "//example.com/"],
      ["second", "u1", "//example.com/blog/"],
    ]);
    const warnings = await repair();

    expect(await domains()).toEqual({
      first: "example.com",
      second: "//example.com/blog/",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Site second");
  });

  it("is idempotent", async () => {
    await seed([["s1", "u1", "//www.osnt.in/"]]);
    await repair();
    expect(await repair()).toEqual([]);
    expect(await domains()).toEqual({ s1: "www.osnt.in" });
  });
});
