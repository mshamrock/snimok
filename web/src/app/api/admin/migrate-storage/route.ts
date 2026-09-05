import { NextResponse } from "next/server";
import { and, eq, like, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { extensionFor } from "@/lib/image";
import { isOnVercelBlob, storage, storageFor, storageKind } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;
const BATCH = 25;

/**
 * POST /api/admin/migrate-storage?key=<DEBUG_KEY>  { exclude?: string[] }
 * Moves captures that still live on Vercel Blob to the configured default
 * storage (R2). Source bytes come from the Blob store, or – when that is
 * unreachable (suspended) and the capture was imported from Gyazo – from
 * Gyazo's direct image URL. Call repeatedly until `remaining` is 0.
 */
export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.DEBUG_KEY || key !== process.env.DEBUG_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (storageKind() === "vercel-blob") {
    return NextResponse.json({ error: "Default storage is still Vercel Blob; configure R2_* first." }, { status: 400 });
  }
  let exclude: string[] = [];
  let mode: string | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.exclude)) exclude = body.exclude.filter((v: unknown) => typeof v === "string").slice(0, 500);
    if (typeof body?.mode === "string") mode = body.mode;
  } catch {
    /* empty body is fine */
  }

  // mode "publicize": once the bucket has a public domain (R2_PUBLIC_BASE_URL),
  // rewrite private r2:// references to direct https URLs so images are served
  // by Cloudflare instead of streamed through /r/<id>.
  if (mode === "publicize") {
    const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
    if (!base) return NextResponse.json({ error: "R2_PUBLIC_BASE_URL is not set" }, { status: 400 });
    const c = schema.captures;
    const rows = await (await db())
      .select({ id: c.id, pathname: c.blobPathname })
      .from(c)
      .where(like(c.blobUrl, "r2://%"))
      .limit(500);
    let updated = 0;
    for (const row of rows) {
      await (await db())
        .update(c)
        .set({ blobUrl: `${base}/${encodeURI(row.pathname)}`, access: "public", updatedAt: new Date() })
        .where(eq(c.id, row.id));
      updated++;
    }
    const [{ n: remaining }] = await (await db())
      .select({ n: sql<number>`count(*)::int` })
      .from(c)
      .where(like(c.blobUrl, "r2://%"));
    return NextResponse.json({ mode, updated, remaining });
  }

  const c = schema.captures;
  const started = Date.now();
  const onBlob = like(c.blobUrl, "%.blob.vercel-storage.com/%");
  const where = exclude.length ? and(onBlob, notInArray(c.id, exclude))! : onBlob;
  const rows = await (await db()).select().from(c).where(where).limit(BATCH);

  let migrated = 0;
  const failed: { id: string; error: string }[] = [];
  const target = storage();

  for (const row of rows) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const bytes = await sourceBytes(row);
      const owner = row.userId ?? `anon-${row.deviceId ?? "unknown"}`;
      const put = await target.put(`captures/${owner}/${row.id}.${extensionFor(row.contentType)}`, bytes, row.contentType);
      await (await db())
        .update(c)
        .set({ blobUrl: put.url, blobPathname: put.pathname, access: put.access, sizeBytes: bytes.byteLength })
        .where(eq(c.id, row.id));
      migrated++;
      // Best effort: free the old object (ignored while the store is suspended).
      if (isOnVercelBlob(row.blobUrl)) await storageFor(row.blobUrl).delete(row.blobUrl).catch(() => {});
    } catch (err) {
      failed.push({ id: row.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const [{ n: remaining }] = await (await db())
    .select({ n: sql<number>`count(*)::int` })
    .from(c)
    .where(onBlob);
  return NextResponse.json({ migrated, failed, remaining, ms: Date.now() - started });
}

async function sourceBytes(row: typeof schema.captures.$inferSelect): Promise<Uint8Array> {
  const errors: string[] = [];
  // 1. The old store itself.
  try {
    const obj = await storageFor(row.blobUrl).open(row.blobUrl, row.access as "public" | "private");
    if (obj) return new Uint8Array(await new Response(obj.stream).arrayBuffer());
    errors.push("not found in Blob");
  } catch (err) {
    errors.push(`blob: ${err instanceof Error ? err.message : err}`);
  }
  // 2. Gyazo still has the original for imported captures.
  if (row.sourceId?.startsWith("gyazo:")) {
    const gyazoId = row.sourceId.slice("gyazo:".length);
    const ext = extensionFor(row.contentType);
    for (const candidate of [ext, "png", "jpg", "gif"]) {
      const res = await fetch(`https://i.gyazo.com/${gyazoId}.${candidate}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) return new Uint8Array(await res.arrayBuffer());
    }
    errors.push("gyazo: not available");
  }
  throw new Error(errors.join("; "));
}
