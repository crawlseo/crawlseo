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
      await connectionsClosed(server);
      await server.stop();
      await pg.close();
    },
  };
}

/**
 * Resolves once the socket server has dropped every client connection.
 *
 * pglite-socket handles a closed connection on a later turn of the event
 * loop, and that handler reads PGlite (it checks for an open transaction).
 * If PGlite is closed first, the handler throws an unhandled TypeError after
 * all tests passed, and Vitest fails the run. The server drops the connection
 * from its count in that same handler, right before the read, so a count of 0
 * means the read has happened.
 */
async function connectionsClosed(server: PGLiteSocketServer, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (server.getStats().activeConnections > 0) {
    if (Date.now() > deadline) throw new Error("test database: client connections did not close");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
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
