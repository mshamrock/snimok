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

export const WATERMARK_SCALE = { min: 25, max: 200, step: 5, default: 100 } as const;

/** Clamps and rounds a percent to the allowed watermark sizes, or null if it is not a number. */
export function normalizeWatermarkScale(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const { min, max, step } = WATERMARK_SCALE;
  return Math.min(max, Math.max(min, Math.round(n / step) * step));
}

export async function setWatermark(
  userId: string,
  patch: { watermark?: boolean; watermarkScale?: number },
): Promise<void> {
  if (patch.watermark === undefined && patch.watermarkScale === undefined) return;
  await (await db()).update(schema.users).set(patch).where(eq(schema.users.id, userId));
}
