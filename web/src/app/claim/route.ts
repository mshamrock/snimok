import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DEVICE_COOKIE, isValidDeviceId, linkDeviceCaptures } from "@/lib/captures";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";

const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // browsers cap at 400 days

/**
 * GET /claim?device=<id>&next=/i/abc
 * Opened by the desktop app instead of the bare permalink. Remembers the
 * device in a cookie (so this browser may edit the device's anonymous
 * captures and link them on sign-in) and redirects to `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const device = url.searchParams.get("device");
  const nextRaw = url.searchParams.get("next") ?? "/captures";
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/captures";
  const res = NextResponse.redirect(`${appUrl()}${next}`, { status: 302 });
  if (isValidDeviceId(device)) {
    // Already signed in here? Then this device's captures belong to the account.
    const user = await getCurrentUser();
    if (user) await linkDeviceCaptures(user.id, device).catch(() => 0);
    res.cookies.set(DEVICE_COOKIE, device, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}
