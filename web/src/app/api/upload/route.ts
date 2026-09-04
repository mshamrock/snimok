import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  captureJson,
  DEVICE_HEADER,
  isAccessPolicy,
  isValidDeviceId,
  normalizeTags,
  storeCapture,
  UploadError,
  withTimeout,
  type CaptureMeta,
} from "@/lib/captures";
import { captureUrl } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/upload
 * Auth: `Authorization: Bearer <api token>` or session cookie for account
 *       uploads; otherwise an `X-Snimok-Device: <id>` header makes an anonymous
 *       upload owned by that device (linked to an account on sign-in).
 * Body: multipart/form-data with `imagedata` (Gyazo-compatible) or `file`,
 *       or a raw image body with an image/* Content-Type.
 * Optional form fields (Gyazo-compatible names accepted): `title`, `desc`,
 * `tags` (comma-separated), `app`, `referer_url`, `source_title`, `ocr`,
 * `access_policy` (anyone | only_me), `created_at` (ISO 8601).
 */
function str(form: FormData, ...names: string[]): string | null {
  for (const n of names) {
    const v = form.get(n);
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}
export async function POST(req: Request) {
  const user = await authenticateRequest(req);
  const deviceHeader = req.headers.get(DEVICE_HEADER)?.trim();
  const deviceId = isValidDeviceId(deviceHeader) ? deviceHeader : null;
  if (!user && !deviceId) {
    return NextResponse.json(
      { error: "Unauthorized: sign in or send an X-Snimok-Device header" },
      { status: 401 },
    );
  }

  try {
    let bytes: Uint8Array;
    let declaredType: string | null = null;
    let meta: CaptureMeta = {};

    const ct = req.headers.get("content-type") ?? "";
    if (ct.startsWith("multipart/form-data")) {
      const form = await withTimeout(req.formData(), 20_000, "reading the upload");
      const file = form.get("imagedata") ?? form.get("file") ?? form.get("image");
      if (!(file instanceof Blob)) {
        throw new UploadError("Missing `imagedata` file field");
      }
      bytes = new Uint8Array(await file.arrayBuffer());
      declaredType = file.type || null;
      const policy = str(form, "access_policy");
      const createdRaw = str(form, "created_at");
      const created = createdRaw ? new Date(createdRaw) : null;
      meta = {
        title: str(form, "title"),
        description: str(form, "desc", "description"),
        tags: normalizeTags(str(form, "tags")),
        app: str(form, "app"),
        sourceTitle: str(form, "source_title", "window_title"),
        sourceUrl: str(form, "referer_url", "source_url", "url"),
        ocrText: str(form, "ocr", "ocr_text"),
        accessPolicy: isAccessPolicy(policy) ? policy : "anyone",
        createdAt:
          created && !Number.isNaN(created.getTime()) && created.getTime() <= Date.now() + 60_000
            ? created
            : null,
      };
    } else if (ct.startsWith("image/")) {
      bytes = new Uint8Array(await req.arrayBuffer());
      declaredType = ct.split(";")[0];
    } else {
      throw new UploadError("Send multipart/form-data or an image/* body");
    }

    const capture = await storeCapture({
      userId: user?.id ?? null,
      deviceId,
      bytes,
      declaredType,
      meta,
    });
    const permalink = captureUrl(capture.id);
    return NextResponse.json(captureJson(capture, permalink), {
      status: 201,
      headers: { Location: permalink },
    });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
