"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "@/app/settings/actions";

export function ProfileForm({ email, displayName }: { email: string; displayName: string | null }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, undefined);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">Signed in as {email}</p>
      <label className="block space-y-1">
        <span className="text-sm">Display name</span>
        <span className="block text-xs text-muted">Shown as “User” on your capture pages instead of your email.</span>
        <div className="flex gap-2">
          <input className="input max-w-xs" name="displayName" defaultValue={displayName ?? ""} maxLength={40} placeholder={email.split("@")[0]} />
          <button className="btn shrink-0" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </label>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-green-600">Saved.</p> : null}
    </form>
  );
}
