import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  canManage,
  canView,
  captureJson,
  deleteCapture,
  getCapture,
  replaceCaptureImage,
  UploadError,
} from "@/lib/captures";
import { captureUrl } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const capture = await getCapture(id);
  if (!capture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canView(capture, await authenticateRequest(req), req))) {
    return NextResponse.json({ error: "This capture is private" }, { status: 403 });
  }
  return NextResponse.json(captureJson(capture, captureUrl(capture.id)));
}

/** PUT: replace the image (owner only). multipart `imagedata` or raw image body. */
export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [user, capture] = await Promise.all([
    authenticateRequest(req),
    getCapture(id),
  ]);
  if (!capture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canManage(capture, user, req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    let bytes: Uint8Array;
    let declaredType: string | null = null;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("imagedata") ?? form.get("file");
      if (!(file instanceof Blob)) throw new UploadError("Missing image");
      bytes = new Uint8Array(await file.arrayBuffer());
      declaredType = file.type || null;
    } else if (ct.startsWith("image/")) {
      bytes = new Uint8Array(await req.arrayBuffer());
      declaredType = ct.split(";")[0];
    } else {
      throw new UploadError("Send multipart/form-data or an image/* body");
    }
    const updated = await replaceCaptureImage(capture, bytes, declaredType);
    return NextResponse.json(captureJson(updated, captureUrl(updated.id)));
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("replace failed", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [user, capture] = await Promise.all([
    authenticateRequest(req),
    getCapture(id),
  ]);
  if (!capture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canManage(capture, user, req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteCapture(capture);
  return new NextResponse(null, { status: 204 });
}
