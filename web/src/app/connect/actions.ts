"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { createApiToken, getCurrentUser } from "@/lib/auth";
import { deviceIdFromRequest, linkDeviceCaptures } from "@/lib/captures";

export type ConnectState = { ok?: boolean; error?: string } | undefined;

export async function approveDeviceCode(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to log in first." };
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  if (!code) return { error: "Missing code." };

  const rows = await (await db())
    .select()
    .from(schema.deviceCodes)
    .where(
      and(
        eq(schema.deviceCodes.code, code),
        gt(schema.deviceCodes.expiresAt, new Date()),
        isNull(schema.deviceCodes.token),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    return { error: "This code is invalid or has expired. Try again from the app." };
  }
  const token = await createApiToken(user.id, "Snimok for Mac");
  await linkDeviceCaptures(user.id, await deviceIdFromRequest()).catch(() => 0);
  await (await db())
    .update(schema.deviceCodes)
    .set({ token })
    .where(eq(schema.deviceCodes.code, code));
  return { ok: true };
}
