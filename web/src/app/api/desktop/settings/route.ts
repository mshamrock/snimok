import { NextResponse } from "next/server";
import { accountForDesktop, normalizeWatermarkScale, setWatermark, WATERMARK_SCALE } from "@/lib/preferences";

export const runtime = "nodejs";

/**
 * GET /api/desktop/settings → { linked, watermark }
 * The Mac app asks before each upload. `linked: false` means the install
 * belongs to no account yet; the app then falls back to its own menu toggle.
 * Auth: Bearer token, or the X-Snimok-Device header of a linked install.
 */
export async function GET(req: Request) {
  const user = await accountForDesktop(req);
  return NextResponse.json(
    {
      linked: !!user,
      watermark: user?.watermark ?? false,
      watermarkScale: user?.watermarkScale ?? WATERMARK_SCALE.default,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * PUT { watermark?: boolean, watermarkScale?: number } — the app's menu
 * toggle writes through to the account.
 */
export async function PUT(req: Request) {
  const user = await accountForDesktop(req);
  if (!user) return NextResponse.json({ linked: false, error: "This install is not linked to an account." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { watermark?: unknown; watermarkScale?: unknown };
  if (body.watermark !== undefined && typeof body.watermark !== "boolean") {
    return NextResponse.json({ error: "watermark must be true or false" }, { status: 400 });
  }
  const scale = body.watermarkScale === undefined ? undefined : normalizeWatermarkScale(body.watermarkScale);
  if (scale === null) return NextResponse.json({ error: "watermarkScale must be a number" }, { status: 400 });
  if (body.watermark === undefined && scale === undefined) {
    return NextResponse.json({ error: "nothing to change" }, { status: 400 });
  }
  const watermark = body.watermark as boolean | undefined;
  await setWatermark(user.id, { watermark, watermarkScale: scale });
  return NextResponse.json({
    linked: true,
    watermark: watermark ?? user.watermark,
    watermarkScale: scale ?? user.watermarkScale,
  });
}
