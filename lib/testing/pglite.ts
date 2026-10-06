import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";

// The real Prisma client against Postgres semantics: PGlite (in-process
// Postgres) behind a local socket, with the full migration chain applied.

const MIGRATIONS = join(__dirname, "../../prisma/migrations");

export type TestDb = { db: PrismaClient; close: () => Promise<void> };

export async function createTestDb(): Promise<TestDb> {
  const pg = await PGlite.create();
  const names = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const name of names) await pg.exec(readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8"));

  const server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0 });
  await server.start();
  const db = new PrismaClient({
    datasourceUrl: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?connection_limit=1&sslmode=disable`,
  });

  return {
    db,
    close: async () => {
      await db.$disconnect();
      await server.stop();
      await pg.close();
    },
  };
}

/**
 * For vi.mock("@/lib/db"): a stand-in whose calls go to the test database once
 * `holder.db` is set in beforeAll.
 */
export function lazyDb(holder: { db: PrismaClient | null }): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get: (_, key) => {
      if (!holder.db) throw new Error("test database not ready");
      return Reflect.get(holder.db, key);
    },
  });
}
