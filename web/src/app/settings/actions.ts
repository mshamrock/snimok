"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { createApiToken, getCurrentUser } from "@/lib/auth";

export type TokenState = { token?: string; error?: string } | undefined;

export async function createToken(
  _prev: TokenState,
  formData: FormData,
): Promise<TokenState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  const name = String(formData.get("name") ?? "").trim() || "API token";
  const token = await createApiToken(user.id, name.slice(0, 60));
  revalidatePath("/settings");
  return { token };
}

export async function revokeToken(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = String(formData.get("id") ?? "");
  await (await db())
    .delete(schema.apiTokens)
    .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, user.id)));
  revalidatePath("/settings");
}

export type ProfileState = { ok?: boolean; error?: string } | undefined;

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  const name = String(formData.get("displayName") ?? "").trim().slice(0, 40);
  await (await db())
    .update(schema.users)
    .set({ displayName: name || null })
    .where(eq(schema.users.id, user.id));
  revalidatePath("/settings");
  return { ok: true };
}
