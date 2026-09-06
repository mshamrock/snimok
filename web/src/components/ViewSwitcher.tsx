"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "./Icon";
import { VIEW_COOKIE, VIEWS, type ViewMode } from "@/lib/view";

/** Persists the choice for a year; the server reads it on the next render. */
function rememberView(v: ViewMode) {
  try {
    document.cookie = `${VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* cookies blocked: the choice just does not persist */
  }
}

/** Segmented control for the timeline layout; the choice lives in a cookie so the server renders it. */
export function ViewSwitcher({ value }: { value: ViewMode }) {
  const router = useRouter();
  const [current, setCurrent] = useState<ViewMode>(value);
  const [pending, start] = useTransition();

  function pick(v: ViewMode) {
    if (v === current) return;
    setCurrent(v);
    rememberView(v);
    start(() => router.refresh());
  }

  return (
    <div
      role="radiogroup"
      aria-label="View"
      className={`inline-flex overflow-hidden rounded-md border border-border bg-card ${pending ? "opacity-70" : ""}`}
    >
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={current === v.id}
          title={v.label}
          onClick={() => pick(v.id)}
          className={`px-2.5 py-1.5 transition-colors ${
            current === v.id ? "bg-card-2 text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          <Icon name={v.icon} className="h-4 w-4" />
          <span className="sr-only">{v.label}</span>
        </button>
      ))}
    </div>
  );
}
