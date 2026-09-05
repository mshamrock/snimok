import "server-only";
import { headers } from "next/headers";
import { appUrl } from "@/lib/env";

export type BlobAccess = "public" | "private";
export type StoredObject = { url: string; pathname: string; access: BlobAccess };
export type OpenedObject = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number | null;
};

export interface ObjectStorage {
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  /** Streams an object; needed for private stores whose URLs are not public. */
  open(url: string, access: BlobAccess): Promise<OpenedObject | null>;
  delete(url: string): Promise<void>;
}

// Remembered across requests once we learn the connected store is private.
const g = globalThis as typeof globalThis & { __snimokBlobPrivate?: boolean };

/**
 * Access mode of the connected Blob store. Set BLOB_ACCESS=private|public to
 * skip auto-detection (the failed "public" attempt on a private store is slow
 * because the SDK retries it).
 */
function configuredAccess(): BlobAccess | null {
  const v = process.env.BLOB_ACCESS?.trim().toLowerCase();
  return v === "private" || v === "public" ? v : null;
}

function jwtExpiresIn(token: string | undefined): number | null {
  try {
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.exp === "number" ? Math.round(payload.exp - Date.now() / 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Auth options for the Blob SDK. With a read-write token nothing is needed.
 * With the OIDC-based store connection we pass the per-request token from the
 * `x-vercel-oidc-token` header explicitly: relying on the SDK's own lookup
 * (request context / process.env) proved unreliable in warm functions, where
 * a stale token made it retry for the whole invocation.
 */
async function blobAuth(): Promise<{ token?: string; oidcToken?: string }> {
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  let fromHeader: string | null = null;
  try {
    fromHeader = (await headers()).get("x-vercel-oidc-token");
  } catch {
    /* outside a request scope */
  }
  const oidcToken = fromHeader ?? process.env.VERCEL_OIDC_TOKEN;
  const ttl = jwtExpiresIn(oidcToken);
  if (ttl !== null && ttl < 30) {
    console.warn(`[blob] OIDC token ${fromHeader ? "from header" : "from env"} expires in ${ttl}s`);
  }
  return oidcToken ? { oidcToken } : {};
}

function isPrivateStoreError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /private store|private access/i.test(msg);
}

/** Production: Vercel Blob. Works with public and private stores. */
const vercelBlob: ObjectStorage = {
  async put(pathname, bytes, contentType) {
    const { put } = await import("@vercel/blob");
    const body = Buffer.from(bytes);
    const common = {
      contentType,
      addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
      ...(await blobAuth()),
    };
    const configured = configuredAccess();
    const t0 = Date.now();
    if (configured !== "private" && !g.__snimokBlobPrivate) {
      try {
        const res = await put(pathname, body, { access: "public", ...common });
        return { url: res.url, pathname: res.pathname, access: "public" };
      } catch (err) {
        if (configured === "public" || !isPrivateStoreError(err)) throw err;
        console.warn(
          `[blob] store is private (detected after ${Date.now() - t0} ms); set BLOB_ACCESS=private to skip this probe`,
        );
        g.__snimokBlobPrivate = true;
      }
    }
    const res = await put(pathname, body, { access: "private", ...common });
    console.log(`[blob] private put ok in ${Date.now() - t0} ms`);
    return { url: res.url, pathname: res.pathname, access: "private" };
  },
  async open(url, access) {
    if (access === "private") {
      const { get } = await import("@vercel/blob");
      const res = await get(url, { access: "private", ...(await blobAuth()) });
      if (!res || res.statusCode !== 200) return null;
      return { stream: res.stream, contentType: res.blob.contentType, size: res.blob.size };
    }
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok || !res.body) return null;
    return {
      stream: res.body,
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      size: Number(res.headers.get("content-length")) || null,
    };
  },
  async delete(url) {
    const { del } = await import("@vercel/blob");
    await del(url, { ...(await blobAuth()) });
  },
};

/** Local development: files under ./.uploads served by /uploads/[...path]. */
const LOCAL_DIR = ".uploads";
const localFiles: ObjectStorage = {
  async put(pathname, bytes, contentType) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { randomBytes } = await import("node:crypto");
    const ext = path.extname(pathname);
    const stem = pathname.slice(0, pathname.length - ext.length);
    const unique = `${stem}-${randomBytes(6).toString("hex")}${ext}`;
    const abs = path.join(process.cwd(), LOCAL_DIR, unique);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, bytes);
    await fs.writeFile(`${abs}.type`, contentType);
    return { url: `${appUrl()}/uploads/${unique}`, pathname: unique, access: "public" };
  },
  async open(url) {
    const rel = new URL(url).pathname.replace(/^\/uploads\//, "");
    const obj = await readLocalObject(rel);
    if (!obj) return null;
    return {
      stream: new Blob([new Uint8Array(obj.bytes)]).stream(),
      contentType: obj.contentType,
      size: obj.bytes.byteLength,
    };
  },
  async delete(url) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const rel = new URL(url).pathname.replace(/^\/uploads\//, "");
    const abs = path.join(process.cwd(), LOCAL_DIR, rel);
    await fs.rm(abs, { force: true });
    await fs.rm(`${abs}.type`, { force: true });
  },
};

/* ------------------------------------------------------------------------ */
/* Cloudflare R2 (any S3-compatible bucket works the same way)               */

type R2Config = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public base URL (custom domain / r2.dev) – when set, objects are public. */
  publicBase: string | null;
};

function r2Config(): R2Config | null {
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint =
    process.env.R2_ENDPOINT ??
    (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;
  return {
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBase: process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "") || null,
  };
}

const gs3 = globalThis as typeof globalThis & { __snimokS3?: import("@aws-sdk/client-s3").S3Client };

async function s3Client(cfg: R2Config) {
  if (gs3.__snimokS3) return gs3.__snimokS3;
  const { S3Client } = await import("@aws-sdk/client-s3");
  gs3.__snimokS3 = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return gs3.__snimokS3;
}

/** Private objects are referenced as r2://<bucket>/<key>; public ones by their https URL. */
function r2Key(cfg: R2Config, url: string): string | null {
  const prefix = `r2://${cfg.bucket}/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  if (cfg.publicBase && url.startsWith(`${cfg.publicBase}/`)) return decodeURI(url.slice(cfg.publicBase.length + 1));
  return null;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

const r2Storage: ObjectStorage = {
  async put(pathname, bytes, contentType) {
    const cfg = r2Config();
    if (!cfg) throw new Error("R2 is not configured");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const dot = pathname.lastIndexOf(".");
    const key = dot > 0 ? `${pathname.slice(0, dot)}-${randomSuffix()}${pathname.slice(dot)}` : `${pathname}-${randomSuffix()}`;
    const client = await s3Client(cfg);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return cfg.publicBase
      ? { url: `${cfg.publicBase}/${encodeURI(key)}`, pathname: key, access: "public" }
      : { url: `r2://${cfg.bucket}/${key}`, pathname: key, access: "private" };
  },
  async open(url) {
    const cfg = r2Config();
    if (!cfg) throw new Error("R2 is not configured");
    const key = r2Key(cfg, url);
    if (!key) return null;
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client(cfg);
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
      if (!res.Body) return null;
      return {
        stream: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        contentType: res.ContentType ?? "application/octet-stream",
        size: res.ContentLength ?? null,
      };
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  },
  async delete(url) {
    const cfg = r2Config();
    if (!cfg) return;
    const key = r2Key(cfg, url);
    if (!key) return;
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client(cfg);
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
  },
};

/* ------------------------------------------------------------------------ */

export type StorageKind = "r2" | "vercel-blob" | "local";

/** Which backend new uploads go to. */
export function storageKind(): StorageKind {
  if (r2Config()) return "r2";
  // A connected Blob store injects either a read-write token or, with the
  // newer OIDC-based connection, BLOB_STORE_ID (the SDK then authenticates
  // with the runtime's VERCEL_OIDC_TOKEN).
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return "vercel-blob";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_UPLOADS === "1") return "local";
  throw new Error(
    "No object storage configured. Set R2_* variables (Cloudflare R2) or attach a Vercel Blob store.",
  );
}

export function storage(): ObjectStorage {
  switch (storageKind()) {
    case "r2":
      return r2Storage;
    case "vercel-blob":
      return vercelBlob;
    default:
      return localFiles;
  }
}

/** The backend that holds an existing object, judged by its stored URL (mixed states happen mid-migration). */
export function storageFor(url: string): ObjectStorage {
  if (url.startsWith("r2://")) return r2Storage;
  const cfg = r2Config();
  if (cfg?.publicBase && url.startsWith(cfg.publicBase)) return r2Storage;
  if (/\.blob\.vercel-storage\.com\//.test(url)) return vercelBlob;
  if (url.includes("/uploads/")) return localFiles;
  return storage();
}

export function isOnVercelBlob(url: string): boolean {
  return /\.blob\.vercel-storage\.com\//.test(url);
}

/** Reads a locally stored object (dev only). */
export async function readLocalObject(
  rel: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.join(process.cwd(), LOCAL_DIR);
  const abs = path.normalize(path.join(root, rel));
  if (!abs.startsWith(root + path.sep)) return null;
  try {
    const [bytes, type] = await Promise.all([
      fs.readFile(abs),
      fs.readFile(`${abs}.type`, "utf8").catch(() => "application/octet-stream"),
    ]);
    return { bytes, contentType: type.trim() };
  } catch {
    return null;
  }
}
