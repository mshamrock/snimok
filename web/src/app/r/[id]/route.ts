import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canView, getCapture, openCaptureImage } from "@/lib/captures";

export const runtime = "nodejs";

/**
 * /r/<id>[.png][?v=<version>] – stable direct-image URL that follows edits.
 * Public blob stores: 302 to the blob. Private stores: the image is streamed
 * through here; with `v` present the response is immutable and CDN-cacheable.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const capture = await getCapture(id.replace(/\.(png|jpe?g|gif|webp)$/i, ""));
  if (!capture) return new NextResponse("Not found", { status: 404 });
  const restricted = capture.accessPolicy === "only_me";
  if (restricted && !(await canView(capture, await getCurrentUser(), req))) {
    return new NextResponse("This capture is private", { status: 403 });
  }

  if (capture.access !== "private") {
    return NextResponse.redirect(capture.blobUrl, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const obj = await openCaptureImage(capture);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  const versioned = new URL(req.url).searchParams.has("v");
  const headers: Record<string, string> = {
    "Content-Type": capture.contentType,
    "Cache-Control": restricted
      ? "private, no-store"
      : versioned
        ? "public, max-age=31536000, s-maxage=31536000, immutable"
        : "public, max-age=0, s-maxage=60",
    "Content-Disposition": "inline",
  };
  if (obj.size) headers["Content-Length"] = String(obj.size);
  return new NextResponse(obj.stream, { headers });
}
