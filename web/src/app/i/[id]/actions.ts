"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  canManage,
  getCapture,
  updateCaptureMeta,
  type CaptureMetaPatch,
} from "@/lib/captures";

export type UpdateResult = { ok: true; tags: string[] } | { ok: false; error: string };

/** Edits title, description, tags or access policy (owner / device only). */
export async function updateCapture(
  id: string,
  patch: CaptureMetaPatch,
): Promise<UpdateResult> {
  const [capture, user] = await Promise.all([getCapture(id), getCurrentUser()]);
  if (!capture) return { ok: false, error: "Not found" };
  if (!(await canManage(capture, user))) return { ok: false, error: "Forbidden" };
  const updated = await updateCaptureMeta(capture, patch);
  revalidatePath(`/i/${id}`);
  revalidatePath("/captures");
  return { ok: true, tags: updated.tags };
}
