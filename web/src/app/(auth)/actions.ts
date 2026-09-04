"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  createSession,
  destroySession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
} from "@/lib/auth";
import { rowId } from "@/lib/ids";

export type AuthState = { error?: string } | undefined;

function safeNext(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/captures";
}

export async function register(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const existing = await (await db())
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing.length) return { error: "An account with this email exists." };

  const id = rowId();
  await (await db())
    .insert(schema.users)
    .values({ id, email, passwordHash: await hashPassword(password) });
  await createSession(id);
  redirect(next);
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const rows = await (await db())
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }
  await createSession(user.id);
  redirect(next);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}
