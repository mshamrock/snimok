"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthState } from "@/app/(auth)/actions";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "register";
  action: (prev: AuthState, data: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isLogin = mode === "login";
  return (
    <form action={formAction} className="card w-full max-w-sm p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          {isLogin ? "Log in" : "Create your account"}
        </h1>
        <p className="text-sm text-muted mt-1">
          {isLogin
            ? "Welcome back."
            : "Free, takes ten seconds. Email and password only."}
        </p>
      </div>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="block space-y-1">
        <span className="text-sm">Email</span>
        <input
          className="input"
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm">Password</span>
        <input
          className="input"
          type="password"
          name="password"
          required
          minLength={isLogin ? undefined : 8}
          autoComplete={isLogin ? "current-password" : "new-password"}
        />
      </label>
      {state?.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Please wait…" : isLogin ? "Log in" : "Sign up"}
      </button>
      <p className="text-sm text-muted text-center">
        {isLogin ? (
          <>
            No account?{" "}
            <Link
              className="underline"
              href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link
              className="underline"
              href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            >
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
