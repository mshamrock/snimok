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

  const params = new URL(req.url).searchParams;
  // `download=1` always streams with an attachment disposition: browsers ignore
  // the `download` attribute on cross-origin links (the image lives on img.*).
  const download = params.has("download");

  if (capture.access !== "private" && !download) {
    return NextResponse.redirect(capture.blobUrl, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let obj: Awaited<ReturnType<typeof openCaptureImage>>;
  try {
    obj = await openCaptureImage(capture);
  } catch (err) {
    // Storage outage (e.g. the Blob store is suspended): show a neutral tile
    // instead of a broken image, and do not let the CDN cache it.
    console.error(`[r] ${capture.id}: ${err instanceof Error ? err.message : err}`);
    return unavailableTile(capture.width ?? 800, capture.height ?? 500);
  }
  if (!obj) return new NextResponse("Not found", { status: 404 });
  const versioned = params.has("v");
  const ext = capture.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const safeTitle = (capture.title ?? "").replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const filename = `${safeTitle || "snimok"}-${capture.id}.${ext}`;
  const headers: Record<string, string> = {
    "Content-Type": capture.contentType,
    "Cache-Control":
      restricted || download
        ? "private, no-store"
        : versioned
          ? "public, max-age=31536000, s-maxage=31536000, immutable"
          : "public, max-age=0, s-maxage=60",
    "Content-Disposition": download ? `attachment; filename="${filename}"` : "inline",
  };
  if (obj.size) headers["Content-Length"] = String(obj.size);
  return new NextResponse(obj.stream, { headers });
}

function unavailableTile(w: number, h: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#17150f"/>
  <g fill="none" stroke="#e6a53f" stroke-width="${Math.max(2, Math.round(w / 300))}">
    <path d="M${w * 0.42} ${h * 0.38}v-${h * 0.06}h${w * 0.04}M${w * 0.58} ${h * 0.38}v-${h * 0.06}h-${w * 0.04}M${w * 0.42} ${h * 0.62}v${h * 0.06}h${w * 0.04}M${w * 0.58} ${h * 0.62}v${h * 0.06}h-${w * 0.04}"/>
  </g>
  <text x="50%" y="52%" text-anchor="middle" fill="#9c9283" font-family="ui-monospace, Menlo, monospace" font-size="${Math.max(12, Math.round(w / 40))}">image temporarily unavailable</text>
</svg>`;
  return new NextResponse(svg, {
    status: 503,
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store", "Retry-After": "600" },
  });
}
