import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { deviceCode } from "@/lib/ids";
import { appUrl } from "@/lib/env";
import { DEVICE_HEADER, isValidDeviceId } from "@/lib/captures";

export const runtime = "nodejs";

const CODE_TTL_MS = 10 * 60 * 1000;

/**
 * POST /api/desktop/code
 * Step 1 of the desktop sign-in: creates a short-lived device code.
 * The app opens `verify_url` in the browser and polls /api/desktop/poll.
 */
export async function POST(req: Request) {
  const device = req.headers.get(DEVICE_HEADER)?.trim();
  const code = deviceCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await (await db()).insert(schema.deviceCodes).values({ code, expiresAt });
  // Opportunistic cleanup of stale codes.
  void (await db())
    .delete(schema.deviceCodes)
    .where(lt(schema.deviceCodes.expiresAt, new Date()))
    .catch(() => {});
  const connectPath = `/connect?code=${code}`;
  const verifyUrl = isValidDeviceId(device)
    ? `${appUrl()}/claim?device=${device}&next=${encodeURIComponent(connectPath)}`
    : `${appUrl()}${connectPath}`;
  return NextResponse.json({
    code,
    verify_url: verifyUrl,
    expires_in: CODE_TTL_MS / 1000,
    interval: 2,
  });
}
