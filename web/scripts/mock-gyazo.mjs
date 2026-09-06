#!/usr/bin/env node
/**
 * Mock Gyazo API for testing the importer locally, no real account needed:
 *   node scripts/mock-gyazo.mjs [image.png]      (listens on :4567)
 *   GYAZO_API_BASE=http://localhost:4567 npm run dev
 * Token: validtoken1234567890. 230 images over 3 pages; page 2 is deliberately
 * short (80 items) to prove X-Total-Count is trusted, image #17 404s, #40 is a
 * video without a URL, and the first request for page 2 answers 429 once.
 */
import http from "node:http";
import fs from "node:fs";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhQGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PNG = process.argv[2] ? fs.readFileSync(process.argv[2]) : ONE_PIXEL_PNG;
const N = 230;
const base = "http://localhost:4567";
const images = Array.from({ length: N }, (_, i) => {
  const n = i + 1;
  const d = new Date(Date.UTC(2024, 11, 31, 12, 0, 0) - i * 3600_000 * 7);
  return {
    image_id: `mock${String(n).padStart(12, "0")}`,
    url: n === 40 ? "" : n === 17 ? `${base}/img/missing.png` : `${base}/img/${n}.png`,
    type: n === 40 ? "mp4" : "png",
    created_at: d.toISOString().replace(/\.\d{3}Z$/, "+0000"),
    metadata: { app: n % 2 ? "Google Chrome" : "Finder", title: `Mock ${n}`, url: n % 3 ? `https://example.com/p/${n}` : null, desc: "" },
    ocr: { locale: "en", description: `ocr ${n}` },
  };
});
const pages = { 1: images.slice(0, 100), 2: images.slice(100, 180), 3: images.slice(180, 230) };
let rateLimited = false;
http.createServer((req, res) => {
  const u = new URL(req.url, base);
  if (u.pathname.startsWith("/img/")) {
    if (u.pathname.endsWith("missing.png")) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": "image/png" }); res.end(PNG); return;
  }
  if (u.pathname !== "/api/images") { res.writeHead(404); res.end(); return; }
  if (u.searchParams.get("access_token") !== "validtoken1234567890") { res.writeHead(401); res.end("{}"); return; }
  const page = Number(u.searchParams.get("page") ?? 1);
  if (page === 2 && !rateLimited) { rateLimited = true; console.log("-> 429 once for page 2"); res.writeHead(429); res.end("{}"); return; }
  console.log(`-> page ${page}: ${(pages[page] ?? []).length} items`);
  res.writeHead(200, { "content-type": "application/json", "x-total-count": String(N), "x-current-page": String(page), "x-user-type": "lite" });
  res.end(JSON.stringify(pages[page] ?? []));
}).listen(4567, () => console.log("mock gyazo v2 listening on 4567"));
