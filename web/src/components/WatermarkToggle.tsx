"use client";

import { useState, useTransition } from "react";
import { toggleWatermark } from "@/app/settings/actions";

/** Account-wide watermark switch; the Mac app reads it before every upload. */
export function WatermarkToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function flip() {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const res = await toggleWatermark(next);
      if (!res.ok) {
        setOn(!next);
        setError(res.error ?? "Could not save.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <p className="text-sm">Watermark</p>
          <p className="text-sm text-muted">
            Stamp <code className="font-mono text-xs">snimok.xyz</code> into the bottom-left corner of every new
            capture and GIF. The ink follows the background: dark on light, light on dark.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Watermark"
          disabled={pending}
          onClick={flip}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${
            on ? "border-accent bg-accent" : "border-border bg-card-2"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full shadow transition-transform ${
              on ? "translate-x-6 bg-accent-fg" : "translate-x-1 bg-muted"
            }`}
          />
        </button>
      </div>
      <p className="label normal-case tracking-normal">
        {on ? "On" : "Off"} · applies to captures taken from now on; existing ones stay as they are
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
