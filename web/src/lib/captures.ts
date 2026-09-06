import "server-only";
import { cookies } from "next/headers";
import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  gt,
  gte,
  count,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db, schema } from "@/db";
import type { AccessPolicy, Capture, User } from "@/db/schema";
import { captureId } from "@/lib/ids";
import { storage, storageFor, type BlobAccess, type OpenedObject } from "@/lib/storage";
import { appUrl } from "@/lib/env";
import { zonedDayStart } from "@/lib/tz";
import {
  ALLOWED_TYPES,
  extensionFor,
  imageDimensions,
  sniffContentType,
} from "@/lib/image";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Cookie that ties a browser to a desktop install (set by /claim). */
export const DEVICE_COOKIE = "snimok_device";
/** Header the desktop app sends with every request. */
export const DEVICE_HEADER = "x-snimok-device";

export function isValidDeviceId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);
}

/** Device id from the desktop header, falling back to the browser cookie. */
export async function deviceIdFromRequest(req?: Request): Promise<string | null> {
  const fromHeader = req?.headers.get(DEVICE_HEADER)?.trim();
  if (isValidDeviceId(fromHeader)) return fromHeader;
  const jar = await cookies();
  const fromCookie = jar.get(DEVICE_COOKIE)?.value;
  return isValidDeviceId(fromCookie) ? fromCookie : null;
}

/** Who may edit / delete a capture: its account owner, or the device that made an anonymous one. */
export async function canManage(
  capture: Capture,
  user: User | null,
  req?: Request,
): Promise<boolean> {
  if (user && capture.userId === user.id) return true;
  if (!capture.userId && capture.deviceId) {
    const device = await deviceIdFromRequest(req);
    return device !== null && device === capture.deviceId;
  }
  return false;
}

/** Anyone may view "anyone" captures; "only_me" ones need manage rights. */
export async function canView(
  capture: Capture,
  user: User | null,
  req?: Request,
): Promise<boolean> {
  if (capture.accessPolicy !== "only_me") return true;
  return canManage(capture, user, req);
}

export function isAccessPolicy(v: unknown): v is AccessPolicy {
  return v === "anyone" || v === "only_me";
}

/** Lower-cases, strips "#", de-duplicates; accepts an array or a comma/space list. */
export function normalizeTags(input: string[] | string | null | undefined): string[] {
  const raw = Array.isArray(input) ? input : (input ?? "").split(/[,\n]+/);
  const out: string[] = [];
  for (const item of raw) {
    const t = item.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 30) break;
  }
  return out;
}

/** Human-readable owner name shown on the capture page. */
export function ownerName(user: Pick<User, "email" | "displayName"> | null): string {
  if (!user) return "Anonymous";
  return user.displayName?.trim() || user.email.split("@")[0];
}

/** Attach every anonymous capture made by `deviceId` to `userId`. */
export async function linkDeviceCaptures(
  userId: string,
  deviceId: string | null,
): Promise<number> {
  if (!deviceId) return 0;
  const rows = await (await db())
    .update(schema.captures)
    .set({ userId })
    .where(
      and(eq(schema.captures.deviceId, deviceId), isNull(schema.captures.userId)),
    )
    .returning({ id: schema.captures.id });
  return rows.length;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Fails fast with a clear message instead of letting the function hit its 60 s limit. */
export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new UploadError(`Timed out after ${ms} ms: ${label}`, 504)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function inspect(bytes: Uint8Array, declaredType: string | null) {
  if (bytes.byteLength === 0) throw new UploadError("Empty image");
  if (bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new UploadError("Image is too large (max 25 MB)", 413);
  const contentType = sniffContentType(bytes, declaredType ?? "image/png");
  if (!ALLOWED_TYPES.has(contentType))
    throw new UploadError(`Unsupported image type: ${contentType}`, 415);
  const dims = imageDimensions(bytes);
  return { contentType, dims };
}

async function uploadBlob(
  owner: string,
  id: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const ext = extensionFor(contentType);
  const t0 = Date.now();
  const res = await withTimeout(
    storage().put(`captures/${owner}/${id}.${ext}`, bytes, contentType),
    25_000,
    "storing the image",
  );
  console.log(`[upload] stored ${bytes.byteLength} B in ${Date.now() - t0} ms (${res.access})`);
  return res;
}

export type CaptureMeta = {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  app?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  ocrText?: string | null;
  accessPolicy?: AccessPolicy;
  createdAt?: Date | null;
  /** e.g. "gyazo:<image_id>" for imported captures. */
  sourceId?: string | null;
};

const clip = (v: string | null | undefined, n: number) => {
  const t = v?.trim();
  return t ? t.slice(0, n) : null;
};

export async function storeCapture(opts: {
  userId: string | null;
  deviceId: string | null;
  bytes: Uint8Array;
  declaredType: string | null;
  title?: string | null;
  meta?: CaptureMeta;
}): Promise<Capture> {
  if (!opts.userId && !opts.deviceId) {
    throw new UploadError("Sign in or send an X-Snimok-Device header", 401);
  }
  const { contentType, dims } = inspect(opts.bytes, opts.declaredType);
  const id = captureId();
  const owner = opts.userId ?? `anon-${opts.deviceId}`;
  const blob = await uploadBlob(owner, id, opts.bytes, contentType);
  const [row] = await withTimeout((async () => (await db())
    .insert(schema.captures)
    .values({
      id,
      userId: opts.userId,
      deviceId: opts.deviceId,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      access: blob.access,
      contentType,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      sizeBytes: opts.bytes.byteLength,
      title: clip(opts.meta?.title ?? opts.title, 200),
      description: clip(opts.meta?.description, 2000),
      tags: normalizeTags(opts.meta?.tags ?? []),
      app: clip(opts.meta?.app, 120),
      sourceTitle: clip(opts.meta?.sourceTitle, 300),
      sourceUrl: clip(opts.meta?.sourceUrl, 2000),
      ocrText: clip(opts.meta?.ocrText, 20000),
      accessPolicy: opts.meta?.accessPolicy ?? "anyone",
      sourceId: clip(opts.meta?.sourceId, 200),
      ...(opts.meta?.createdAt ? { createdAt: opts.meta.createdAt } : {}),
    })
    .returning())(), 15_000, "saving the record");
  return row;
}

export type CaptureMetaPatch = {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  accessPolicy?: AccessPolicy;
};

/** Updates title / description / tags / access policy. */
export async function updateCaptureMeta(
  capture: Capture,
  patch: CaptureMetaPatch,
): Promise<Capture> {
  const set: Partial<typeof schema.captures.$inferInsert> = { updatedAt: new Date() };
  if ("title" in patch) set.title = clip(patch.title, 200);
  if ("description" in patch) set.description = clip(patch.description, 2000);
  if (patch.tags) set.tags = normalizeTags(patch.tags);
  if (patch.accessPolicy && isAccessPolicy(patch.accessPolicy)) set.accessPolicy = patch.accessPolicy;
  const [row] = await (await db())
    .update(schema.captures)
    .set(set)
    .where(eq(schema.captures.id, capture.id))
    .returning();
  return row;
}

/** Replaces the image of an existing capture (after editing in the browser). */
export async function replaceCaptureImage(
  capture: Capture,
  bytes: Uint8Array,
  declaredType: string | null,
): Promise<Capture> {
  const { contentType, dims } = inspect(bytes, declaredType);
  const owner = capture.userId ?? `anon-${capture.deviceId ?? "unknown"}`;
  const blob = await uploadBlob(owner, capture.id, bytes, contentType);
  const [row] = await (await db())
    .update(schema.captures)
    .set({
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      access: blob.access,
      contentType,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      sizeBytes: bytes.byteLength,
      updatedAt: new Date(),
    })
    .where(eq(schema.captures.id, capture.id))
    .returning();
  if (capture.blobUrl !== blob.url) {
    await storageFor(capture.blobUrl).delete(capture.blobUrl).catch(() => {});
  }
  return row;
}

export async function deleteCapture(capture: Capture): Promise<void> {
  await (await db()).delete(schema.captures).where(eq(schema.captures.id, capture.id));
  await storageFor(capture.blobUrl).delete(capture.blobUrl).catch(() => {});
}

export async function getCapture(id: string): Promise<Capture | null> {
  const rows = await (await db())
    .select()
    .from(schema.captures)
    .where(eq(schema.captures.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type CaptureOwner = { userId: string } | { deviceId: string };

export type ListFilters = {
  limit?: number;
  before?: Date;
  /** Free-text search over title, description, tags, OCR text, app and source. */
  q?: string;
  tag?: string;
  app?: string;
  /** Host of `sourceUrl` without "www." (see `siteExpr`). */
  site?: string;
  /** "gif" = animated captures only, "image" = everything but GIFs. */
  type?: "gif" | "image";
  /** "only_me" = private captures only. */
  access?: "only_me";
  /** YYYY-MM-DD in the viewer's time zone (`tz`, default UTC). */
  day?: string;
  tz?: string;
};

/** SQL for the host part of `source_url` ("https://www.foo.com/x" → "foo.com"). */
const siteExpr = sql<string>`regexp_replace(split_part(split_part(lower(${schema.captures.sourceUrl}), '://', 2), '/', 1), '^www\\.', '')`;

/** Turns a URL into the same host form `siteExpr` produces, or null. */
export function siteOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  return m[1].toLowerCase().replace(/^www\./, "") || null;
}

function ownerWhere(owner: CaptureOwner): SQL {
  return "userId" in owner
    ? eq(schema.captures.userId, owner.userId)
    : and(
        eq(schema.captures.deviceId, owner.deviceId),
        isNull(schema.captures.userId),
      )!;
}

function filtersWhere(owner: CaptureOwner, f: ListFilters): SQL {
  const c = schema.captures;
  const conds: SQL[] = [ownerWhere(owner)];
  const q = f.q?.trim();
  if (q) {
    const pat = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        ilike(c.title, pat),
        ilike(c.description, pat),
        ilike(c.ocrText, pat),
        ilike(c.app, pat),
        ilike(c.sourceTitle, pat),
        ilike(c.sourceUrl, pat),
        sql`array_to_string(${c.tags}, ' ') ILIKE ${pat}`,
      )!,
    );
  }
  if (f.tag) conds.push(arrayContains(c.tags, [f.tag.toLowerCase()]));
  if (f.app) conds.push(eq(c.app, f.app));
  if (f.site) conds.push(sql`${siteExpr} = ${f.site.toLowerCase()}`);
  if (f.type === "gif") conds.push(eq(c.contentType, "image/gif"));
  if (f.type === "image") conds.push(sql`${c.contentType} <> 'image/gif'`);
  if (f.access === "only_me") conds.push(eq(c.accessPolicy, "only_me"));
  if (f.day && /^\d{4}-\d{2}-\d{2}$/.test(f.day)) {
    const start = zonedDayStart(f.day, f.tz ?? "UTC");
    if (start) {
      const end = new Date(start.getTime() + 86_400_000);
      conds.push(gte(c.createdAt, start), lt(c.createdAt, end));
    }
  }
  if (f.before) conds.push(lt(c.createdAt, f.before));
  return and(...conds)!;
}

/** Captures of an account, or the anonymous captures of a device. */
export async function listCaptures(
  owner: CaptureOwner,
  opts: ListFilters = {},
): Promise<Capture[]> {
  const limit = Math.min(opts.limit ?? 60, 200);
  return (await db())
    .select()
    .from(schema.captures)
    .where(filtersWhere(owner, opts))
    .orderBy(desc(schema.captures.createdAt))
    .limit(limit);
}

/** Source ids (e.g. "gyazo:<id>") the user already imported, among the given candidates. */
export async function existingSourceIds(userId: string, sourceIds: string[]): Promise<Set<string>> {
  if (sourceIds.length === 0) return new Set();
  const rows = await (await db())
    .select({ sourceId: schema.captures.sourceId })
    .from(schema.captures)
    .where(and(eq(schema.captures.userId, userId), inArray(schema.captures.sourceId, sourceIds)));
  return new Set(rows.map((r) => r.sourceId).filter((v): v is string => !!v));
}

/** Ids of the adjacent captures in the owner's timeline (for ← → navigation). */
export async function neighborIds(
  owner: CaptureOwner,
  capture: Capture,
): Promise<{ newer: string | null; older: string | null }> {
  const c = schema.captures;
  const d = await db();
  const [newer, older] = await Promise.all([
    d
      .select({ id: c.id })
      .from(c)
      .where(and(ownerWhere(owner), gt(c.createdAt, capture.createdAt)))
      .orderBy(asc(c.createdAt))
      .limit(1),
    d
      .select({ id: c.id })
      .from(c)
      .where(and(ownerWhere(owner), lt(c.createdAt, capture.createdAt)))
      .orderBy(desc(c.createdAt))
      .limit(1),
  ]);
  return { newer: newer[0]?.id ?? null, older: older[0]?.id ?? null };
}

/** Most used tags of an owner (from the latest captures), for suggestions. */
/** Number of captures the owner has (optionally under the same filters as `listCaptures`). */
export async function countCaptures(owner: CaptureOwner, f: ListFilters = {}): Promise<number> {
  const rows = await (await db())
    .select({ n: count() })
    .from(schema.captures)
    .where(filtersWhere(owner, { ...f, before: undefined, limit: undefined }));
  return rows[0]?.n ?? 0;
}

/** Totals for the library sidebar in one query. */
export async function libraryStats(
  owner: CaptureOwner,
): Promise<{ total: number; gifs: number; privateCount: number }> {
  const c = schema.captures;
  const rows = await (await db())
    .select({
      total: count(),
      gifs: sql<number>`count(*) filter (where ${c.contentType} = 'image/gif')`.mapWith(Number),
      privateCount: sql<number>`count(*) filter (where ${c.accessPolicy} = 'only_me')`.mapWith(Number),
    })
    .from(c)
    .where(ownerWhere(owner));
  return rows[0] ?? { total: 0, gifs: 0, privateCount: 0 };
}

export type Facet = { name: string; n: number };

/** Every tag the owner uses, most used first. */
export async function tagCounts(owner: CaptureOwner): Promise<Facet[]> {
  const c = schema.captures;
  const tag = sql<string>`t.tag`;
  const rows = await (await db())
    .select({ name: tag, n: count() })
    .from(sql`${c}, unnest(${c.tags}) AS t(tag)`)
    .where(ownerWhere(owner))
    .groupBy(tag)
    .orderBy(desc(count()), tag);
  return rows.map((r) => ({ name: r.name, n: Number(r.n) }));
}

/** Every source application, most frequent first. */
export async function appCounts(owner: CaptureOwner): Promise<Facet[]> {
  const c = schema.captures;
  const rows = await (await db())
    .select({ name: c.app, n: count() })
    .from(c)
    .where(and(ownerWhere(owner), isNotNull(c.app)))
    .groupBy(c.app)
    .orderBy(desc(count()), c.app);
  return rows.flatMap((r) => (r.name ? [{ name: r.name, n: Number(r.n) }] : []));
}

/** Every website captures came from (host of `sourceUrl`), most frequent first. */
export async function siteCounts(owner: CaptureOwner): Promise<Facet[]> {
  const c = schema.captures;
  const rows = await (await db())
    .select({ name: siteExpr, n: count() })
    .from(c)
    .where(and(ownerWhere(owner), isNotNull(c.sourceUrl), sql`${siteExpr} <> ''`))
    .groupBy(siteExpr)
    .orderBy(desc(count()), siteExpr);
  return rows.flatMap((r) => (r.name ? [{ name: r.name, n: Number(r.n) }] : []));
}

export async function topTags(owner: CaptureOwner, limit = 12): Promise<string[]> {
  const rows = await (await db())
    .select({ tags: schema.captures.tags })
    .from(schema.captures)
    .where(ownerWhere(owner))
    .orderBy(desc(schema.captures.createdAt))
    .limit(300);
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
}

/**
 * URL browsers can load the image from. Public stores expose the blob
 * directly; private stores are streamed through /r/<id> (versioned so the
 * CDN can cache it forever).
 */
export function imageUrl(c: Capture): string {
  if (c.access === "private") {
    return `${appUrl()}/r/${c.id}?v=${c.updatedAt.getTime()}`;
  }
  return c.blobUrl;
}

/** Opens the stored image as a stream (works for private stores too). */
export function openCaptureImage(c: Capture): Promise<OpenedObject | null> {
  return storageFor(c.blobUrl).open(c.blobUrl, c.access as BlobAccess);
}

export function captureJson(c: Capture, permalink: string) {
  const img = imageUrl(c);
  return {
    id: c.id,
    url: img,
    image_url: img,
    permalink_url: permalink,
    type: extensionFor(c.contentType),
    content_type: c.contentType,
    width: c.width,
    height: c.height,
    size: c.sizeBytes,
    title: c.title,
    description: c.description,
    tags: c.tags,
    app: c.app,
    source_title: c.sourceTitle,
    source_url: c.sourceUrl,
    access_policy: c.accessPolicy,
    has_ocr: !!c.ocrText,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}
