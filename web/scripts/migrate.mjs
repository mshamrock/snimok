// Runs pending SQL migrations from ./drizzle against DATABASE_URL.
// Used as part of `npm run build` so a Vercel deploy migrates the DB.
// Skips silently when no database URL is configured (e.g. local build).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL_UNPOOLED;

if (!url) {
  console.log("[migrate] DATABASE_URL not set, skipping migrations");
  process.exit(0);
}

const db = drizzle(neon(url));
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("[migrate] database is up to date");
