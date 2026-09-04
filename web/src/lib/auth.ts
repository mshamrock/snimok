import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { rowId, secret } from "@/lib/ids";
import { deviceIdFromRequest, linkDeviceCaptures } from "@/lib/captures";

export const SESSION_COOKIE = "snimok_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Creates a DB session and writes the cookie. Server Actions / Route Handlers only. */
export async function createSession(userId: string): Promise<void> {
  const id = secret();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await (await db()).insert(schema.sessions).values({ id, userId, expiresAt });
  // Anonymous captures made by this browser's desktop app now belong to the user.
  await linkDeviceCaptures(userId, await deviceIdFromRequest()).catch(() => 0);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    await (await db()).delete(schema.sessions).where(eq(schema.sessions.id, id));
  }
  jar.delete(SESSION_COOKIE);
}

async function userForSession(sessionId: string): Promise<User | null> {
  const rows = await (await db())
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0]?.user ?? null;
}

/** Current user from the session cookie, memoised per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  try {
    return await userForSession(id);
  } catch {
    return null;
  }
});

export async function getUserById(id: string): Promise<User | null> {
  const rows = await (await db())
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Redirects to /login (remembering the destination) when signed out. */
export async function requireUser(next?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    const q = next ? `?next=${encodeURIComponent(next)}` : "";
    redirect(`/login${q}`);
  }
  return user;
}

async function userForApiToken(token: string): Promise<User | null> {
  const rows = await (await db())
    .select({ user: schema.users, tokenId: schema.apiTokens.id })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
    .where(eq(schema.apiTokens.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Fire-and-forget bookkeeping.
  void (await db())
    .update(schema.apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiTokens.id, row.tokenId))
    .catch(() => {});
  return row.user;
}

/**
 * Authenticates an API request: `Authorization: Bearer <api token>` first
 * (desktop app), then the browser session cookie (web editor).
 */
export async function authenticateRequest(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (m) {
    const user = await userForApiToken(m[1].trim());
    if (user) return user;
  }
  const url = new URL(req.url);
  const qsToken = url.searchParams.get("access_token");
  if (qsToken) {
    const user = await userForApiToken(qsToken);
    if (user) return user;
  }
  return getCurrentUser();
}

export async function createApiToken(
  userId: string,
  name: string,
): Promise<string> {
  const token = secret();
  await (await db())
    .insert(schema.apiTokens)
    .values({ id: rowId(), token, userId, name });
  return token;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
