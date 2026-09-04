import { NextResponse } from "next/server";
import { readLocalObject } from "@/lib/storage";

export const runtime = "nodejs";

/** Serves locally stored uploads in development (Vercel Blob is used in prod). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const obj = await readLocalObject(path.join("/"));
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(obj.bytes), {
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
