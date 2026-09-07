#!/usr/bin/env node
/**
 * One-off maintenance: captures imported from Gyazo before 2026-09-06 were
 * stored with updated_at = import time, which the Recap counts as "edited".
 * Resets updated_at to created_at for those rows (only where nothing was
 * edited after the import cutoff). Safe to re-run.
 *
 *   cd web
 *   npx vercel env pull .env.prod.local --environment=production --yes
 *   node --env-file=.env.prod.local scripts/fix-import-timestamps.mjs
 *   rm .env.prod.local
 *
 * Options: --cutoff 2026-09-06T00:00:00Z   (rows updated after this are left alone)
 *          --dry-run                         (only count)
 */
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const DRY = args.includes("--dry-run");
const cutoff = opt("--cutoff", "2026-09-06T00:00:00Z");
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set (run with node --env-file=.env.prod.local …)");
  process.exit(1);
}
const sql = neon(url);

const [before] = await sql`
  select count(*)::int as n from captures
  where source_id like 'gyazo:%' and updated_at > created_at + interval '1 minute'`;
console.log(`imported rows whose updated_at is the import time: ${before.n}`);
if (DRY) process.exit(0);

const rows = await sql`
  update captures set updated_at = created_at
  where source_id like 'gyazo:%'
    and updated_at > created_at + interval '1 minute'
    and updated_at < ${cutoff}::timestamptz
  returning id`;
console.log(`reset updated_at = created_at on ${rows.length} rows`);

const [after] = await sql`
  select count(*)::int as n from captures
  where source_id like 'gyazo:%' and updated_at > created_at + interval '1 minute'`;
console.log(`still counted as edited (touched after the cutoff): ${after.n}`);
