import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { deviceIdFromRequest, linkDeviceCaptures, type CaptureOwner } from "@/lib/captures";
import type { User } from "@/db/schema";

/**
 * Whose library is this browser looking at: the signed-in account, or the
 * desktop install remembered in the device cookie. Anyone else is sent to
 * log in. A signed-in browser that also carries the device cookie adopts that
 * device's anonymous captures, so the app's uploads show up in the account.
 */
export async function libraryOwner(next = "/captures"): Promise<{ owner: CaptureOwner; user: User | null }> {
  const [user, deviceId] = await Promise.all([getCurrentUser(), deviceIdFromRequest()]);
  if (!user && !deviceId) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (user && deviceId) await linkDeviceCaptures(user.id, deviceId).catch(() => 0);
  return { owner: user ? { userId: user.id } : { deviceId: deviceId! }, user };
}
