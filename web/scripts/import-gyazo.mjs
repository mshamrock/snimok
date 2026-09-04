#!/usr/bin/env node
/**
 * Imports your Gyazo library into Snimok, keeping dates, app / page metadata,
 * descriptions and OCR text. Every imported capture gets the tag "gyazo".
 *
 * Usage:
 *   GYAZO_TOKEN=... SNIMOK_TOKEN=... node scripts/import-gyazo.mjs [options]
 *
 * Env:
 *   GYAZO_TOKEN    Gyazo API access token (https://gyazo.com/oauth/applications
 *                  -> New application -> "Your access token").
 *   SNIMOK_TOKEN   Snimok API token (Settings -> API tokens). Required unless
 *                  SNIMOK_DEVICE is given (anonymous import owned by a device id).
 *   SNIMOK_URL     Snimok base URL (default https://snimok-ten.vercel.app).
 *
 * Options:
 *   --dry-run        Only list what would be imported.
 *   --limit N        Import at most N images (newest first).
 *   --from-json F    Read the image list from a JSON file (Gyazo API format)
 *                    instead of calling the Gyazo API.
 *   --state F        Resume file (default ./import-gyazo.state.json).
 *   --concurrency N  Parallel uploads (default 3).
 */
import fs from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const GYAZO_TOKEN = process.env.GYAZO_TOKEN;
const SNIMOK_TOKEN = process.env.SNIMOK_TOKEN;
const SNIMOK_DEVICE = process.env.SNIMOK_DEVICE;
const SNIMOK_URL = (process.env.SNIMOK_URL ?? "https://snimok-ten.vercel.app").replace(/\/$/, "");
const DRY = flag("--dry-run");
const LIMIT = Number(opt("--limit", "0")) || Infinity;
const FROM_JSON = opt("--from-json", null);
const STATE_FILE = opt("--state", "./import-gyazo.state.json");
const CONCURRENCY = Math.max(1, Number(opt("--concurrency", "3")) || 3);
const MAX_BYTES = 4.4 * 1024 * 1024; // Vercel request body limit is 4.5 MB

if (!FROM_JSON && !GYAZO_TOKEN) die("GYAZO_TOKEN is required (or use --from-json).");
if (!DRY && !SNIMOK_TOKEN && !SNIMOK_DEVICE) die("SNIMOK_TOKEN is required (or SNIMOK_DEVICE for an anonymous import).");

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Gyazo

async function listGyazoImages() {
  if (FROM_JSON) {
    const data = JSON.parse(await fs.readFile(FROM_JSON, "utf8"));
    return Array.isArray(data) ? data : data.images ?? [];
  }
  const all = [];
  for (let page = 1; ; page++) {
    const url = `https://api.gyazo.com/api/images?access_token=${encodeURIComponent(GYAZO_TOKEN)}&per_page=100&page=${page}`;
    const res = await fetch(url);
    if (res.status === 429) {
      console.log("  rate limited by Gyazo, waiting 30 s…");
      await sleep(30_000);
      page--;
      continue;
    }
    if (!res.ok) die(`Gyazo API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    all.push(...batch);
    const total = Number(res.headers.get("x-total-count") ?? 0);
    process.stdout.write(`\r  fetched ${all.length}${total ? ` / ${total}` : ""} from Gyazo`);
    if (batch.length < 100) break;
    await sleep(250);
  }
  console.log();
  return all;
}

// Gyazo returns e.g. "2014-05-21T14:23:10+0900" – make the offset ISO-compliant.
function isoDate(s) {
  if (!s) return null;
  const fixed = String(s).replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(fixed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// Snimok

async function uploadToSnimok(img, bytes, contentType) {
  const form = new FormData();
  const ext = (img.type || "png").toLowerCase();
  form.append("imagedata", new Blob([bytes], { type: contentType }), `${img.image_id}.${ext}`);
  const meta = img.metadata ?? {};
  if (meta.title) form.append("title", String(meta.title).slice(0, 200));
  if (meta.desc) form.append("desc", String(meta.desc));
  if (meta.app) form.append("app", String(meta.app));
  if (meta.url) form.append("referer_url", String(meta.url));
  if (meta.title) form.append("source_title", String(meta.title));
  if (img.ocr?.description) form.append("ocr", String(img.ocr.description));
  const created = isoDate(img.created_at);
  if (created) form.append("created_at", created);
  form.append("tags", "gyazo");

  const headers = {};
  if (SNIMOK_TOKEN) headers.Authorization = `Bearer ${SNIMOK_TOKEN}`;
  if (SNIMOK_DEVICE) headers["X-Snimok-Device"] = SNIMOK_DEVICE;
  const res = await fetch(`${SNIMOK_URL}/api/upload`, { method: "POST", headers, body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`Snimok ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch {
    return { done: {}, failed: {} };
  }
}
let saveTimer = null;
async function saveState(state) {
  clearTimeout(saveTimer);
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function main() {
  console.log(`Snimok import from Gyazo → ${SNIMOK_URL}${DRY ? " (dry run)" : ""}`);
  const state = await loadState();
  const images = await listGyazoImages();
  const todo = images.filter((i) => !state.done[i.image_id]).slice(0, LIMIT);
  const skippedNoUrl = todo.filter((i) => !i.url);
  const queue = todo.filter((i) => !!i.url);
  console.log(
    `${images.length} images in Gyazo, ${Object.keys(state.done).length} already imported, ` +
      `${queue.length} to import${skippedNoUrl.length ? `, ${skippedNoUrl.length} without a downloadable URL (skipped)` : ""}.`,
  );
  if (DRY) {
    for (const i of queue.slice(0, 20)) {
      console.log(`  ${i.image_id}  ${i.created_at}  ${i.type}  ${i.metadata?.app ?? ""}  ${i.metadata?.title ?? ""}`);
    }
    if (queue.length > 20) console.log(`  … and ${queue.length - 20} more`);
    return;
  }

  let ok = 0;
  let failed = 0;
  let n = 0;
  const total = queue.length;

  async function worker() {
    while (queue.length) {
      const img = queue.shift();
      const idx = ++n;
      try {
        const res = await fetch(img.url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > MAX_BYTES) throw new Error(`too large (${(bytes.byteLength / 1048576).toFixed(1)} MB > 4.4 MB)`);
        const contentType = res.headers.get("content-type")?.split(";")[0] || `image/${img.type || "png"}`;
        const out = await uploadToSnimok(img, bytes, contentType);
        state.done[img.image_id] = out.id;
        delete state.failed[img.image_id];
        ok++;
        console.log(`[${idx}/${total}] ${img.image_id} → ${out.permalink_url}`);
      } catch (err) {
        failed++;
        state.failed[img.image_id] = String(err.message ?? err);
        console.log(`[${idx}/${total}] ${img.image_id} FAILED: ${err.message ?? err}`);
      }
      if (idx % 5 === 0) await saveState(state);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await saveState(state);
  console.log(`\nDone: ${ok} imported, ${failed} failed. State saved to ${STATE_FILE} (re-run to retry failures).`);
}

main().catch((e) => die(e.stack ?? String(e)));
