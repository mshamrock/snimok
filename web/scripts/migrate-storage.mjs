#!/usr/bin/env node
/**
 * Drives /api/admin/migrate-storage until every capture has left Vercel Blob.
 * Usage: SNIMOK_URL=https://snimok.xyz ADMIN_KEY=<DEBUG_KEY> node scripts/migrate-storage.mjs
 */
const base = (process.env.SNIMOK_URL ?? "https://snimok.xyz").replace(/\/$/, "");
const key = process.env.ADMIN_KEY;
if (!key) {
  console.error("ADMIN_KEY (the project's DEBUG_KEY env var) is required");
  process.exit(1);
}
const exclude = new Set();
let total = 0;
for (let round = 1; ; round++) {
  const res = await fetch(`${base}/api/admin/migrate-storage?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ exclude: [...exclude] }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("error:", data.error ?? res.status);
    process.exit(1);
  }
  total += data.migrated;
  for (const f of data.failed) {
    exclude.add(f.id);
    console.log(`  failed ${f.id}: ${f.error}`);
  }
  console.log(`round ${round}: +${data.migrated} migrated (${total} total), ${data.remaining} still on Blob, ${data.failed.length} failed`);
  if (data.remaining - exclude.size <= 0 || (data.migrated === 0 && data.failed.length === 0)) break;
}
console.log(`done: ${total} migrated, ${exclude.size} could not be moved (re-run later once the Blob store is unblocked).`);
