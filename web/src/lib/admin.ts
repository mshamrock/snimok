import "server-only";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";

/**
 * Admins are listed by email in ADMIN_EMAILS (comma-separated, Vercel env).
 * There is no admin role in the database on purpose: nothing to escalate to.
 */
export function isAdmin(user: Pick<User, "email"> | null): boolean {
  if (!user) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

export type UserStats = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  captures: number;
  images: number;
  gifs: number;
  imported: number;
  bytes: number;
  lastCapture: Date | null;
  devices: number;
  watermark: boolean;
};

export const SORTS = ["captures", "gifs", "images", "bytes", "last", "joined", "email"] as const;
export type Sort = (typeof SORTS)[number];

/** Every account with its capture counts, in one grouped query. */
export async function userStats(sort: Sort): Promise<UserStats[]> {
  const u = schema.users;
  const c = schema.captures;
  const captures = sql<number>`count(${c.id})`.mapWith(Number);
  const gifs = sql<number>`count(${c.id}) filter (where ${c.contentType} = 'image/gif')`.mapWith(Number);
  const images = sql<number>`count(${c.id}) filter (where ${c.contentType} <> 'image/gif')`.mapWith(Number);
  const imported = sql<number>`count(${c.id}) filter (where ${c.sourceId} like 'gyazo:%')`.mapWith(Number);
  const bytes = sql<number>`coalesce(sum(${c.sizeBytes}), 0)`.mapWith(Number);
  const lastCapture = sql<Date | null>`max(${c.createdAt})`.mapWith((v) => (v ? new Date(v) : null));
  const devices = sql<number>`(select count(*) from ${schema.deviceLinks} where ${schema.deviceLinks.userId} = ${u.id})`.mapWith(Number);
  const order = {
    captures: desc(captures),
    gifs: desc(gifs),
    images: desc(images),
    bytes: desc(bytes),
    last: sql`max(${c.createdAt}) desc nulls last`,
    joined: desc(u.createdAt),
    email: u.email,
  }[sort];
  return (await db())
    .select({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      watermark: u.watermark,
      captures,
      images,
      gifs,
      imported,
      bytes,
      lastCapture,
      devices,
    })
    .from(u)
    .leftJoin(c, eq(c.userId, u.id))
    .groupBy(u.id)
    .orderBy(order, u.email);
}

/** Captures that belong to no account yet (desktop installs nobody signed in from). */
export async function anonymousStats(): Promise<{ captures: number; gifs: number; bytes: number; devices: number }> {
  const c = schema.captures;
  const [row] = await (await db())
    .select({
      captures: sql<number>`count(*)`.mapWith(Number),
      gifs: sql<number>`count(*) filter (where ${c.contentType} = 'image/gif')`.mapWith(Number),
      bytes: sql<number>`coalesce(sum(${c.sizeBytes}), 0)`.mapWith(Number),
      devices: sql<number>`count(distinct ${c.deviceId})`.mapWith(Number),
    })
    .from(c)
    .where(isNull(c.userId));
  return row ?? { captures: 0, gifs: 0, bytes: 0, devices: 0 };
}
