"use client";

import { useActionState } from "react";
import { createToken, type TokenState } from "@/app/settings/actions";
import { CopyButton } from "./CopyButton";

export function NewTokenForm() {
  const [state, action, pending] = useActionState<TokenState, FormData>(
    createToken,
    undefined,
  );
  return (
    <div className="space-y-3">
      <form action={action} className="flex gap-2">
        <input
          className="input"
          name="name"
          placeholder="Token name (e.g. Work laptop)"
        />
        <button className="btn btn-primary shrink-0" disabled={pending}>
          Create token
        </button>
      </form>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state?.token ? (
        <div className="rounded-md border border-border bg-background p-3 space-y-2">
          <p className="text-xs text-muted">
            Copy it now – it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all font-mono text-xs">{state.token}</code>
            <CopyButton text={state.token} label="Copy" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
