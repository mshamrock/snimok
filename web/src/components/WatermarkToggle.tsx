"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveWatermarkScale, toggleWatermark } from "@/app/settings/actions";

const MIN = 25;
const MAX = 200;
const STEP = 5;
const PRESETS = [50, 75, 100, 150];
/** The app's automatic size on a 1280×800 capture (3.5 % of the short side). */
const BASE_PX = 28;

/** Account-wide watermark switch and size; the Mac app reads both before every upload. */
export function WatermarkToggle({ initial, initialScale }: { initial: boolean; initialScale: number }) {
  const [on, setOn] = useState(initial);
  const [scale, setScale] = useState(initialScale);
  const [saved, setSaved] = useState(initialScale);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

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

  /** Updates the preview at once and saves after the slider settles. */
  function pickScale(v: number) {
    setScale(v);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      start(async () => {
        const res = await saveWatermarkScale(v);
        if (res.ok && res.watermarkScale !== undefined) setSaved(res.watermarkScale);
        else setError(res.error ?? "Could not save.");
      });
    }, 350);
  }

  const px = Math.round((BASE_PX * scale) / 100);

  return (
    <div className="space-y-4">
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

      <div className={`space-y-3 transition-opacity ${on ? "" : "opacity-60"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="watermark-size" className="text-sm">Size</label>
          <input
            id="watermark-size"
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={scale}
            onChange={(e) => pickScale(Number(e.target.value))}
            className="h-1.5 min-w-40 flex-1 cursor-pointer accent-[var(--accent)]"
            aria-valuetext={`${scale} percent`}
          />
          <span className="data w-12 text-right">{scale}%</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => pickScale(p)}
              className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                scale === p ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {p}%
            </button>
          ))}
        </div>

        {/* Real pixel size on a 1280×800 capture viewed at 100 %, on both kinds of background. */}
        <div className="grid grid-cols-2 gap-2" aria-hidden>
          <div className="flex h-20 items-end overflow-hidden rounded-md border border-border bg-[#f4f1ea] p-2">
            <span className="font-mono font-medium leading-none text-[#1b1712]/85" style={{ fontSize: px }}>
              snimok.xyz
            </span>
          </div>
          <div className="flex h-20 items-end overflow-hidden rounded-md border border-border bg-[#141416] p-2">
            <span
              className="font-mono font-medium leading-none text-[#f1e9da]/90"
              style={{ fontSize: px, textShadow: "0 0 3px rgba(0,0,0,.55)" }}
            >
              snimok.xyz
            </span>
          </div>
        </div>
      </div>

      <p className="label normal-case tracking-normal">
        {on ? "On" : "Off"} · {saved}% ≈ {Math.round((BASE_PX * saved) / 100)} px on a 1280×800 capture · applies to
        captures taken from now on
        {pending ? " · saving…" : ""}
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
