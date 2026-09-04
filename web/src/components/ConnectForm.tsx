"use client";

import { useActionState } from "react";
import { approveDeviceCode, type ConnectState } from "@/app/connect/actions";

export function ConnectForm({ code, email }: { code: string; email: string }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(
    approveDeviceCode,
    undefined,
  );
  if (state?.ok) {
    return (
      <div className="card w-full max-w-md p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-600 text-2xl">
          ✓
        </div>
        <h1 className="text-xl font-semibold">Desktop app connected</h1>
        <p className="text-sm text-muted">
          You can close this tab and go back to Snimok. Your pending screenshot
          is uploading now.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="card w-full max-w-md p-8 space-y-4">
      <h1 className="text-xl font-semibold">Connect Snimok for Mac</h1>
      <p className="text-sm text-muted">
        The desktop app wants to upload screenshots to{" "}
        <span className="font-medium text-foreground">{email}</span>. Confirm
        that the code below matches the one shown in the app.
      </p>
      <div className="rounded-md border border-border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.3em]">
        {code}
      </div>
      <input type="hidden" name="code" value={code} />
      {state?.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
