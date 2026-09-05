import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { storage, storageKind } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

function exp(token: string | undefined) {
  try {
    if (!token) return null;
    const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return { exp_in_s: Math.round(p.exp - Date.now() / 1000), aud: p.aud, sub: p.sub, iss: p.iss };
  } catch {
    return "unparseable";
  }
}

async function timed<T>(label: string, fn: (signal: AbortSignal) => Promise<T>) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const value = await fn(ctrl.signal);
    return { label, ok: true, ms: Date.now() - t0, value };
  } catch (e) {
    const err = e as Error & { code?: string; status?: number };
    return { label, ok: false, ms: Date.now() - t0, name: err.name, message: err.message, code: err.code, status: err.status };
  } finally {
    clearTimeout(timer);
  }
}

/** Temporary diagnostics for the Blob connection. Requires ?key=DEBUG_KEY. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.DEBUG_KEY || key !== process.env.DEBUG_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const h = await headers();
  const headerToken = h.get("x-vercel-oidc-token") ?? undefined;
  const envToken = process.env.VERCEL_OIDC_TOKEN;
  const blob = await import("@vercel/blob");
  const oidcToken = headerToken ?? envToken;
  const auth = process.env.BLOB_READ_WRITE_TOKEN
    ? { token: process.env.BLOB_READ_WRITE_TOKEN }
    : oidcToken
      ? { oidcToken }
      : {};

  const results = [];
  results.push(await timed("list", (signal) => blob.list({ limit: 1, abortSignal: signal, ...auth })));
  results.push(
    await timed("put-private", (signal) =>
      blob.put("debug/ping.txt", Buffer.from("ping"), { access: "private", addRandomSuffix: true, abortSignal: signal, ...auth }),
    ),
  );
  const putRes = results[1];
  if (putRes.ok && putRes.value && typeof putRes.value === "object" && "url" in putRes.value) {
    const url = (putRes.value as { url: string }).url;
    results.push(await timed("get-private", (signal) => blob.get(url, { access: "private", abortSignal: signal, ...auth }).then((r) => r?.statusCode)));
    results.push(await timed("del", (signal) => blob.del(url, { abortSignal: signal, ...auth })));
  }
  // Also try the SDK's own token discovery (no explicit oidcToken).
  results.push(await timed("list-sdk-auth", (signal) => blob.list({ limit: 1, abortSignal: signal })));
  // The configured default storage (R2 when R2_* is set) – put, open, delete.
  results.push(
    await timed(`default-storage (${storageKind()})`, async () => {
      const st = storage();
      const put = await st.put(`debug/probe-${Date.now()}.txt`, new TextEncoder().encode("ping"), "text/plain");
      const opened = await st.open(put.url, put.access);
      const size = opened ? (await new Response(opened.stream).arrayBuffer()).byteLength : null;
      await st.delete(put.url);
      return { url: put.url, access: put.access, readBack: size };
    }),
  );

  return NextResponse.json({
    env: {
      BLOB_STORE_ID: !!process.env.BLOB_STORE_ID,
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
      BLOB_ACCESS: process.env.BLOB_ACCESS ?? null,
      R2: !!(process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT)),
      R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL ?? null,
      VERCEL_OIDC_TOKEN: exp(envToken),
      header_token: exp(headerToken),
      region: process.env.VERCEL_REGION,
    },
    results,
  });
}

/** POST multipart `imagedata`: replicate the upload path's put with the real bytes. */
export async function POST(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!process.env.DEBUG_KEY || key !== process.env.DEBUG_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const results = [];
  const formRes = await timed("formData", () => req.formData());
  results.push({ ...formRes, value: undefined });
  if (!formRes.ok || !formRes.value) return NextResponse.json({ results });
  const file = formRes.value.get("imagedata");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "no imagedata" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  results.push(
    await timed("storage.put (app code)", () =>
      storage().put(`debug/anon-dev-test-1234/${Date.now()}.png`, bytes, "image/png"),
    ),
  );
  const blob = await import("@vercel/blob");
  const h = await headers();
  const oidcToken = h.get("x-vercel-oidc-token") ?? process.env.VERCEL_OIDC_TOKEN;
  results.push(
    await timed("sdk.put png+cache (explicit token)", (signal) =>
      blob.put(`debug/direct/${Date.now()}.png`, Buffer.from(bytes), {
        access: "private",
        contentType: "image/png",
        addRandomSuffix: true,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
        abortSignal: signal,
        ...(oidcToken ? { oidcToken } : {}),
      }),
    ),
  );
  results.push(
    await timed("sdk.put png no-cache-option", (signal) =>
      blob.put(`debug/direct2/${Date.now()}.png`, Buffer.from(bytes), {
        access: "private",
        contentType: "image/png",
        addRandomSuffix: true,
        abortSignal: signal,
        ...(oidcToken ? { oidcToken } : {}),
      }),
    ),
  );
  // Clean up whatever succeeded.
  for (const r of results) {
    const v = r.value as { url?: string } | undefined;
    if (r.ok && v?.url) await blob.del(v.url, oidcToken ? { oidcToken } : {}).catch(() => {});
  }
  return NextResponse.json({ size: bytes.byteLength, results: results.map((r) => ({ ...r, value: r.ok ? "ok" : undefined })) });
}
