import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

function connectionString(): string | undefined {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED
  );
}

// Cached on globalThis so every server bundle (route handlers, server
// actions, RSC) in the same process shares one connection / PGlite instance.
const g = globalThis as typeof globalThis & { __snimokDb?: Promise<Db> | null };

async function connectNeon(url: string): Promise<Db> {
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { neon } = await import("@neondatabase/serverless");
  return drizzle(neon(url), { schema }) as unknown as Db;
}

/**
 * Local development fallback: an embedded Postgres (PGlite) persisted to
 * ./.pglite, migrated automatically. Never used when DATABASE_URL is set.
 */
async function connectPglite(): Promise<Db> {
  const path = await import("node:path");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(path.join(process.cwd(), ".pglite"));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("[db] using embedded PGlite database at ./.pglite");
  return db as unknown as Db;
}

/** Returns the (lazily created) database handle. */
export function db(): Promise<Db> {
  if (!g.__snimokDb) {
    const url = connectionString();
    let created: Promise<Db>;
    if (url) {
      created = connectNeon(url);
    } else if (process.env.NODE_ENV !== "production" || process.env.ALLOW_PGLITE === "1") {
      created = connectPglite();
    } else {
      throw new Error(
        "DATABASE_URL is not set. Attach a Neon Postgres store to the Vercel project (Storage tab) or set it in .env.local.",
      );
    }
    g.__snimokDb = created;
    created.catch(() => {
      g.__snimokDb = null;
    });
  }
  return g.__snimokDb;
}

export { schema };
