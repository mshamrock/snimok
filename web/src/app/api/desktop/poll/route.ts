import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const runtime = "nodejs";

/**
 * GET /api/desktop/poll?code=xxxx
 * Step 3 of the desktop sign-in. Returns {status:"pending"} until the user
 * approves the code in the browser, then {status:"ok", token} once.
 */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }
  const rows = await (await db())
    .select()
    .from(schema.deviceCodes)
    .where(eq(schema.deviceCodes.code, code))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) {
      await (await db())
        .delete(schema.deviceCodes)
        .where(eq(schema.deviceCodes.code, code));
    }
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }
  if (!row.token) {
    return NextResponse.json(
      { status: "pending" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  // One-shot: hand out the token and forget the code.
  await (await db()).delete(schema.deviceCodes).where(eq(schema.deviceCodes.code, code));
  return NextResponse.json(
    { status: "ok", token: row.token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
