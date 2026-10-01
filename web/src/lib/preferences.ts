import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { authenticateRequest } from "@/lib/auth";
import { DEVICE_HEADER, isValidDeviceId } from "@/lib/captures";
import type { User } from "@/db/schema";

/**
 * The account a desktop request acts for: its API token / session, otherwise
 * the account its device was linked to. Devices linked before device_links
 * existed are recognised by their adopted captures (and remembered from then on).
 */
export async function accountForDesktop(req: Request): Promise<User | null> {
  const user = await authenticateRequest(req);
  if (user) return user;
  const device = req.headers.get(DEVICE_HEADER)?.trim();
  if (!isValidDeviceId(device)) return null;
  const d = await db();
  const [link] = await d
    .select({ user: schema.users })
    .from(schema.deviceLinks)
    .innerJoin(schema.users, eq(schema.users.id, schema.deviceLinks.userId))
    .where(eq(schema.deviceLinks.deviceId, device))
    .limit(1);
  if (link) return link.user;
  const [adopted] = await d
    .select({ user: schema.users })
    .from(schema.captures)
    .innerJoin(schema.users, eq(schema.users.id, schema.captures.userId))
    .where(and(eq(schema.captures.deviceId, device), isNotNull(schema.captures.userId)))
    .orderBy(desc(schema.captures.createdAt))
    .limit(1);
  if (!adopted) return null;
  await d.insert(schema.deviceLinks).values({ deviceId: device, userId: adopted.user.id }).onConflictDoNothing();
  return adopted.user;
}

export async function setWatermark(userId: string, on: boolean): Promise<void> {
  await (await db()).update(schema.users).set({ watermark: on }).where(eq(schema.users.id, userId));
}
