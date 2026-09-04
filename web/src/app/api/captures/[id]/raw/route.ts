import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canView, getCapture, openCaptureImage } from "@/lib/captures";

export const runtime = "nodejs";

/** Same-origin proxy of the image so the browser editor can read pixels. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const capture = await getCapture(id);
  if (!capture) return new NextResponse("Not found", { status: 404 });
  if (!(await canView(capture, await getCurrentUser(), req))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const obj = await openCaptureImage(capture);
  if (!obj) return new NextResponse("Upstream error", { status: 502 });
  return new NextResponse(obj.stream, {
    headers: {
      "Content-Type": capture.contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
