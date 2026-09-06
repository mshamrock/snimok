import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { existingSourceIds, storeCapture, withTimeout } from "@/lib/captures";
import { captureUrl } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const PER_PAGE = 100;
const TIME_BUDGET_MS = 30_000; // leaves room for one in-flight chunk under Vercel's 60 s cap
/** Images downloaded + stored at the same time within one call. */
const CONCURRENCY = 6;
const MAX_BYTES = 25 * 1024 * 1024;
const GYAZO_API = process.env.GYAZO_API_BASE ?? "https://api.gyazo.com";

type GyazoImage = {
  image_id: string;
  url?: string;
  type?: string;
  created_at?: string;
  metadata?: { app?: string | null; title?: string | null; url?: string | null; desc?: string | null };
  ocr?: { locale?: string; description?: string | null };
};

// Gyazo returns e.g. "2014-05-21T14:23:10+0900".
function isoDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * POST /api/import/gyazo  { token, page, offset }
 * Imports one slice of the signed-in user's Gyazo library into their account.
 * The browser calls this repeatedly with the returned cursor until `done`;
 * the Gyazo token is only ever held in the request, never stored.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in to import into your account." }, { status: 401 });

  let body: { token?: string; page?: number; offset?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const token = String(body.token ?? "").trim();
  const page = Math.max(1, Number(body.page) || 1);
  let offset = Math.max(0, Number(body.offset) || 0);
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(token)) {
    return NextResponse.json({ error: "That does not look like a Gyazo access token." }, { status: 400 });
  }

  const started = Date.now();
  const listRes = await withTimeout(
    fetch(`${GYAZO_API}/api/images?access_token=${encodeURIComponent(token)}&per_page=${PER_PAGE}&page=${page}`, {
      cache: "no-store",
    }),
    20_000,
    "contacting Gyazo",
  ).catch((e: Error) => e);
  if (listRes instanceof Error) {
    return NextResponse.json({ error: listRes.message }, { status: 504 });
  }
  if (listRes.status === 401 || listRes.status === 403) {
    return NextResponse.json({ error: "Gyazo rejected the token." }, { status: 400 });
  }
  if (listRes.status === 429) {
    return NextResponse.json({ error: "Gyazo rate limit, try again in a minute." }, { status: 429 });
  }
  if (!listRes.ok) {
    return NextResponse.json({ error: `Gyazo API error ${listRes.status}` }, { status: 502 });
  }
  const images = (await listRes.json()) as GyazoImage[];
  const total = Number(listRes.headers.get("x-total-count") ?? 0) || null;
  const userType = listRes.headers.get("x-user-type");

  const slice = images.slice(offset);
  const already = await existingSourceIds(user.id, slice.map((i) => `gyazo:${i.image_id}`));

  let imported = 0;
  let skipped = 0;
  const failed: { id: string; error: string }[] = [];
  const links: string[] = [];

  async function importOne(img: GyazoImage) {
    const sourceId = `gyazo:${img.image_id}`;
    if (already.has(sourceId)) {
      skipped++;
      return;
    }
    if (!img.url) {
      skipped++; // videos / unavailable images have no direct URL
      return;
    }
    try {
      const res = await withTimeout(fetch(img.url, { cache: "no-store" }), 15_000, "downloading the image");
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) throw new Error("image larger than 25 MB");
      const m = img.metadata ?? {};
      const capture = await storeCapture({
        userId: user!.id,
        deviceId: null,
        bytes,
        declaredType: res.headers.get("content-type")?.split(";")[0] ?? `image/${img.type ?? "png"}`,
        meta: {
          title: m.title ?? null,
          description: m.desc ?? null,
          tags: ["gyazo"],
          app: m.app ?? null,
          sourceTitle: m.title ?? null,
          sourceUrl: m.url ?? null,
          ocrText: img.ocr?.description ?? null,
          createdAt: isoDate(img.created_at),
          sourceId,
        },
      });
      imported++;
      if (links.length < 5) links.push(captureUrl(capture.id));
    } catch (err) {
      failed.push({ id: img.image_id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Chunks of CONCURRENCY, so the cursor (`offset`) only ever points past
  // fully handled items even though downloads run in parallel.
  for (let i = 0; i < slice.length; i += CONCURRENCY) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const chunk = slice.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(importOne));
    offset += chunk.length;
  }

  const pageDone = offset >= images.length;
  // Trust X-Total-Count when Gyazo sends it: a short page in the middle of the
  // library (hidden or deleted items) must not end the import early.
  const exhausted =
    images.length === 0 || (total !== null ? page * PER_PAGE >= total : images.length < PER_PAGE);
  const done = pageDone && exhausted;
  return NextResponse.json({
    total,
    pages: total !== null ? Math.ceil(total / PER_PAGE) : null,
    page,
    userType,
    imported,
    skipped,
    failed,
    links,
    done,
    next: done ? null : pageDone ? { page: page + 1, offset: 0 } : { page, offset },
  });
}
