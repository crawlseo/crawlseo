#!/usr/bin/env tsx
/**
 * Repair Keyword and Page rows written with a host-local-midnight date.
 *
 * Until fix/gsc-utc-dates the background GSC sync stored each GSC day at
 * local midnight of the server, while the manual sync stored it at UTC
 * midnight. On any server not running in UTC this left rows whose date is
 * not at 00:00:00 UTC, and the same query-day or page-day could exist twice.
 *
 * For every non-zero UTC offset the old code stored GSC day D somewhere
 * strictly between D-1 00:00Z and D 00:00Z (east of UTC: D-1 22:00Z in
 * Madrid; west: D-1 04:00Z in New York), so the true day is always
 * date_trunc('day', date) + 1 day.
 *
 * Per table (Keyword keyed by siteId+query, Page keyed by siteId+url):
 *   a) delete shifted rows that already have a UTC-midnight twin for that day
 *   b) move the remaining shifted rows to UTC midnight of that day
 *
 * Usage:
 *   npx tsx scripts/fix-gsc-dates.ts          # dry run: print counts only
 *   npx tsx scripts/fix-gsc-dates.ts --apply  # apply, in one transaction
 */

import { Prisma, PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

type Tx = Prisma.TransactionClient | PrismaClient;

const TABLES = [
  { name: "Keyword", key: "query" },
  { name: "Page", key: "url" },
] as const;

type Table = (typeof TABLES)[number];

function sql(table: Table) {
  const t = Prisma.raw(`"${table.name}"`);
  const key = Prisma.raw(`"${table.key}"`);
  const shifted = Prisma.sql`s."date" <> date_trunc('day', s."date")`;
  const target = Prisma.sql`date_trunc('day', s."date") + interval '1 day'`;
  const hasTwin = Prisma.sql`EXISTS (
    SELECT 1 FROM ${t} u
    WHERE u."siteId" = s."siteId" AND u.${key} = s.${key} AND u."date" = ${target}
  )`;

  return {
    countShifted: Prisma.sql`SELECT count(*)::int AS n FROM ${t} s WHERE ${shifted}`,
    countWithTwin: Prisma.sql`SELECT count(*)::int AS n FROM ${t} s WHERE ${shifted} AND ${hasTwin}`,
    // Shifted rows without a twin that would land on the same day, e.g. if
    // the server timezone changed between syncs. Moving them would violate
    // the unique key, and there is no way to tell which one is newer.
    countCollisions: Prisma.sql`SELECT count(*)::int AS n FROM (
      SELECT 1 FROM ${t} s
      WHERE ${shifted} AND NOT ${hasTwin}
      GROUP BY s."siteId", s.${key}, ${target}
      HAVING count(*) > 1
    ) c`,
    deleteWithTwin: Prisma.sql`DELETE FROM ${t} s WHERE ${shifted} AND ${hasTwin}`,
    moveShifted: Prisma.sql`UPDATE ${t} s SET "date" = ${target} WHERE ${shifted}`,
  };
}

async function count(tx: Tx, query: Prisma.Sql): Promise<number> {
  const [row] = await tx.$queryRaw<{ n: number }[]>(query);
  return row.n;
}

async function survey(tx: Tx) {
  const rows = [];
  for (const table of TABLES) {
    const q = sql(table);
    const shifted = await count(tx, q.countShifted);
    const withTwin = await count(tx, q.countWithTwin);
    const collisions = await count(tx, q.countCollisions);
    rows.push({ table, shifted, withTwin, toMove: shifted - withTwin, collisions });
  }
  return rows;
}

async function main() {
  console.log(apply ? "Mode: APPLY (one transaction)\n" : "Mode: DRY RUN (pass --apply to write)\n");

  const before = await survey(db);
  for (const r of before) {
    console.log(`${r.table.name}:`);
    console.log(`  rows not at UTC midnight:        ${r.shifted}`);
    console.log(`  a) delete (UTC twin exists):      ${r.withTwin}`);
    console.log(`  b) move to UTC midnight:          ${r.toMove}`);
    if (r.collisions > 0) {
      console.log(`  ! days with conflicting rows:     ${r.collisions}`);
    }
  }

  if (before.some((r) => r.collisions > 0)) {
    console.error(
      "\nSome shifted rows map to the same day with no UTC twin to keep " +
        "(the server timezone probably changed between syncs). Nothing was " +
        "written. Delete those rows for the affected sites and re-sync from " +
        "Search Console instead."
    );
    process.exitCode = 1;
    return;
  }

  if (before.every((r) => r.shifted === 0)) {
    console.log("\nNothing to fix.");
    return;
  }

  if (!apply) {
    console.log("\nDry run: nothing written. Re-run with --apply to fix.");
    return;
  }

  await db.$transaction(
    async (tx) => {
      for (const table of TABLES) {
        const q = sql(table);
        const deleted = await tx.$executeRaw(q.deleteWithTwin);
        const moved = await tx.$executeRaw(q.moveShifted);
        console.log(`\n${table.name}: deleted ${deleted}, moved ${moved}`);
      }

      const after = await survey(tx);
      if (after.some((r) => r.shifted > 0)) {
        throw new Error("Rows still not at UTC midnight after the fix; rolled back.");
      }
    },
    { timeout: 10 * 60_000 }
  );

  console.log("\nDone. All Keyword and Page dates are at UTC midnight.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
