"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Corners } from "../Corners";

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Tool =
  | "select"
  | "pen"
  | "highlight"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text"
  | "pixelate"
  | "crop";

type Shape =
  | { kind: "pen" | "highlight"; points: Pt[]; color: string; width: number }
  | { kind: "line" | "arrow" | "rect" | "ellipse"; a: Pt; b: Pt; color: string; width: number }
  | { kind: "pixelate"; a: Pt; b: Pt; block: number }
  | { kind: "text"; at: Pt; text: string; color: string; size: number }
  | { kind: "crop"; a: Pt; b: Pt };

type Base = { src: CanvasImageSource; width: number; height: number };
type Snapshot = { base: Base; ops: Shape[] };

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "a" | "b";
type Drag =
  | { kind: "move"; index: number; start: Pt; orig: Shape }
  | { kind: "resize"; index: number; handle: Handle; start: Pt; orig: Shape; origBox: Box };

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#111111", "#ffffff"];
const SIZES: { label: string; width: number }[] = [
  { label: "S", width: 2 },
  { label: "M", width: 4 },
  { label: "L", width: 8 },
];
const textSizeFor = (width: number) => width * 6 + 8; // 20 / 32 / 56 px
const blockFor = (width: number) => width * 3 + 2; // 8 / 14 / 26 px

const TOOLS: { id: Tool; label: string; hint: string; icon: string }[] = [
  { id: "select", label: "Select", hint: "Click an object to select it; drag to move, drag the handles to resize, Delete removes it, double-click text to edit", icon: "M5 3l14 8-6 2-2 6z" },
  { id: "pen", label: "Pen", hint: "Freehand drawing", icon: "M4 20l4-1 10-10-3-3L5 16z" },
  { id: "highlight", label: "Marker", hint: "Translucent highlighter", icon: "M3 21h6M6 18l9-9 3 3-9 9H6zM14 8l3-3 3 3-3 3" },
  { id: "line", label: "Line", hint: "Straight line", icon: "M4 20L20 4" },
  { id: "arrow", label: "Arrow", hint: "Arrow", icon: "M4 20L20 4M12 4h8v8" },
  { id: "rect", label: "Rect", hint: "Rectangle", icon: "M4 5h16v14H4z" },
  { id: "ellipse", label: "Ellipse", hint: "Ellipse", icon: "M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z" },
  { id: "text", label: "Text", hint: "Click to add text", icon: "M5 5h14M12 5v14" },
  { id: "pixelate", label: "Blur", hint: "Pixelate a region", icon: "M4 4h5v5H4zM10 10h5v5h-5zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z" },
  { id: "crop", label: "Crop", hint: "Drag to crop", icon: "M7 3v14h14M3 7h14v14" },
];

// ---------------------------------------------------------------------------
// Geometry helpers

function norm(a: Pt, b: Pt): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

let fontFamilyCache: string | null = null;
function fontFamily(): string {
  if (fontFamilyCache) return fontFamilyCache;
  fontFamilyCache =
    (typeof document !== "undefined" && getComputedStyle(document.body).fontFamily) || "sans-serif";
  return fontFamilyCache;
}
const fontFor = (size: number) => `600 ${size}px ${fontFamily()}`;

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, size: number): { w: number; h: number } {
  if (!measureCtx && typeof document !== "undefined") {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  const lines = text.split("\n");
  let w = 0;
  if (measureCtx) {
    measureCtx.font = fontFor(size);
    for (const line of lines) w = Math.max(w, measureCtx.measureText(line).width);
  } else {
    w = Math.max(...lines.map((l) => l.length)) * size * 0.6;
  }
  return { w: Math.max(w, size * 0.5), h: lines.length * size * 1.2 };
}

function bboxOf(s: Shape): Box {
  switch (s.kind) {
    case "pen":
    case "highlight": {
      const pad = s.kind === "highlight" ? s.width * 2 : s.width / 2;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of s.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case "line":
    case "arrow": {
      const r = norm(s.a, s.b);
      const pad = s.width / 2 + 2;
      return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
    }
    case "rect":
    case "ellipse":
    case "pixelate":
    case "crop":
      return norm(s.a, s.b);
    case "text": {
      const m = measureText(s.text, s.size);
      return { x: s.at.x, y: s.at.y, w: m.w, h: m.h };
    }
  }
}

function handlesOf(s: Shape, box: Box): { id: Handle; x: number; y: number }[] {
  if (s.kind === "line" || s.kind === "arrow") {
    return [{ id: "a", ...s.a }, { id: "b", ...s.b }];
  }
  const { x, y, w, h } = box;
  const corners: { id: Handle; x: number; y: number }[] = [
    { id: "nw", x, y }, { id: "ne", x: x + w, y }, { id: "se", x: x + w, y: y + h }, { id: "sw", x, y: y + h },
  ];
  if (s.kind === "text" || s.kind === "pen" || s.kind === "highlight") return corners;
  return [
    ...corners,
    { id: "n", x: x + w / 2, y }, { id: "s", x: x + w / 2, y: y + h },
    { id: "w", x, y: y + h / 2 }, { id: "e", x: x + w, y: y + h / 2 },
  ];
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function inBox(p: Pt, b: Box, tol: number) {
  return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
}

function hitShape(s: Shape, p: Pt, tol: number): boolean {
  switch (s.kind) {
    case "pen":
    case "highlight": {
      const t = Math.max(tol, s.kind === "highlight" ? s.width * 2 : s.width);
      if (s.points.length === 1) return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= t;
      for (let i = 1; i < s.points.length; i++) {
        if (distToSegment(p, s.points[i - 1], s.points[i]) <= t) return true;
      }
      return false;
    }
    case "line":
    case "arrow":
      return distToSegment(p, s.a, s.b) <= Math.max(tol, s.width);
    default:
      return inBox(p, bboxOf(s), tol);
  }
}

function hitTest(ops: Shape[], p: Pt, tol: number): number | null {
  for (let i = ops.length - 1; i >= 0; i--) if (hitShape(ops[i], p, tol)) return i;
  return null;
}

function moveShape(s: Shape, dx: number, dy: number): Shape {
  const mv = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  switch (s.kind) {
    case "pen":
    case "highlight":
      return { ...s, points: s.points.map(mv) };
    case "text":
      return { ...s, at: mv(s.at) };
    default:
      return { ...s, a: mv(s.a), b: mv(s.b) };
  }
}

function boxFromHandle(o: Box, handle: Handle, dx: number, dy: number): Box {
  let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
  if (handle.includes("w")) x1 += dx;
  if (handle.includes("e")) x2 += dx;
  if (handle.includes("n")) y1 += dy;
  if (handle.includes("s")) y2 += dy;
  const x = Math.min(x1, x2), y = Math.min(y1, y2);
  return { x, y, w: Math.max(1, Math.abs(x2 - x1)), h: Math.max(1, Math.abs(y2 - y1)) };
}

/** Maps a shape's geometry from its original bounding box onto a new one. */
function resizeTo(orig: Shape, from: Box, to: Box): Shape {
  const sx = from.w > 0 ? to.w / from.w : 1;
  const sy = from.h > 0 ? to.h / from.h : 1;
  const map = (p: Pt): Pt => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy });
  switch (orig.kind) {
    case "pen":
    case "highlight":
      return { ...orig, points: orig.points.map(map) };
    case "text": {
      const size = Math.max(8, Math.min(400, orig.size * (to.h / Math.max(1, from.h))));
      return { ...orig, at: { x: to.x, y: to.y }, size };
    }
    case "line":
    case "arrow":
      return { ...orig, a: map(orig.a), b: map(orig.b) };
    default:
      return { ...orig, a: { x: to.x, y: to.y }, b: { x: to.x + to.w, y: to.y + to.h } };
  }
}

const CURSORS: Record<Handle, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", a: "move", b: "move",
};

// ---------------------------------------------------------------------------
// Drawing

function drawShape(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: Shape, isDraft: boolean) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (s.kind) {
    case "pen":
    case "highlight": {
      if (s.points.length === 0) break;
      ctx.strokeStyle = s.color;
      if (s.kind === "highlight") {
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = s.width * 4;
        ctx.lineCap = "butt";
      } else {
        ctx.lineWidth = s.width;
      }
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.1, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
      break;
    }
    case "line":
    case "arrow": {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width;
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const len = Math.hypot(dx, dy);
      if (s.kind === "arrow" && len > 0) {
        const head = Math.max(12, s.width * 4);
        const ang = Math.atan2(dy, dx);
        const backX = s.b.x - Math.cos(ang) * head * 0.8;
        const backY = s.b.y - Math.sin(ang) * head * 0.8;
        ctx.beginPath();
        ctx.moveTo(s.a.x, s.a.y);
        ctx.lineTo(backX, backY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.b.x, s.b.y);
        ctx.lineTo(s.b.x - head * Math.cos(ang - Math.PI / 6), s.b.y - head * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(s.b.x - head * Math.cos(ang + Math.PI / 6), s.b.y - head * Math.sin(ang + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(s.a.x, s.a.y);
        ctx.lineTo(s.b.x, s.b.y);
        ctx.stroke();
      }
      break;
    }
    case "rect": {
      const r = norm(s.a, s.b);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      break;
    }
    case "ellipse": {
      const r = norm(s.a, s.b);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "pixelate": {
      const r = norm(s.a, s.b);
      const x = Math.max(0, Math.floor(r.x));
      const y = Math.max(0, Math.floor(r.y));
      const w = Math.min(canvas.width - x, Math.ceil(r.w));
      const h = Math.min(canvas.height - y, Math.ceil(r.h));
      if (w < 1 || h < 1) break;
      const sw = Math.max(1, Math.round(w / s.block));
      const sh = Math.max(1, Math.round(h / s.block));
      const small = document.createElement("canvas");
      small.width = sw;
      small.height = sh;
      const sctx = small.getContext("2d")!;
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(canvas, x, y, w, h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, sw, sh, x, y, w, h);
      if (isDraft) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
      break;
    }
    case "text": {
      ctx.font = fontFor(s.size);
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = s.size / 6;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = s.color;
      s.text.split("\n").forEach((line, i) => ctx.fillText(line, s.at.x, s.at.y + i * s.size * 1.2));
      break;
    }
    case "crop": {
      const r = norm(s.a, s.b);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
      ctx.font = "600 14px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(`${Math.round(r.w)} × ${Math.round(r.h)}`, r.x + 6, r.y + 6);
      break;
    }
  }
  ctx.restore();
}

function paint(canvas: HTMLCanvasElement, snap: Snapshot, draft: Shape | null) {
  if (canvas.width !== snap.base.width) canvas.width = snap.base.width;
  if (canvas.height !== snap.base.height) canvas.height = snap.base.height;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(snap.base.src, 0, 0, snap.base.width, snap.base.height);
  for (const op of snap.ops) drawShape(ctx, canvas, op, false);
  if (draft) drawShape(ctx, canvas, draft, true);
}

/** Selection outline + handles, sized in screen pixels (scale = css px per canvas px). */
let accentCache: string | null = null;
function accentColor(): string {
  if (accentCache) return accentCache;
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() : "";
  accentCache = v || "#e6a53f";
  return accentCache;
}

function drawSelection(canvas: HTMLCanvasElement, shape: Shape, scale: number) {
  const ctx = canvas.getContext("2d")!;
  const box = bboxOf(shape);
  const k = 1 / Math.max(scale, 0.01);
  ctx.save();
  ctx.strokeStyle = accentColor();
  ctx.lineWidth = 1.5 * k;
  ctx.setLineDash([6 * k, 4 * k]);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.setLineDash([]);
  const hs = 9 * k;
  for (const h of handlesOf(shape, box)) {
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
  }
  ctx.restore();
}

function flatten(snap: Snapshot): HTMLCanvasElement {
  const c = document.createElement("canvas");
  paint(c, snap, null);
  return c;
}

function ToolIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// ---------------------------------------------------------------------------

export function Editor({
  captureId,
  imageSrc,
  onClose,
  onSaved,
}: {
  captureId: string;
  imageSrc: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Shape | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const workingRef = useRef<Shape | null>(null);
  const movedRef = useRef(false);
  const textInputRef = useRef<HTMLInputElement>(null);
  const textOpenedAt = useRef(0);
  const editingTextIndex = useRef<number | null>(null);

  const [history, setHistory] = useState<Snapshot[]>([]);
  const [index, setIndex] = useState(-1);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState("crosshair");
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [textValue, setTextValue] = useState("");
  const [textBoxSize, setTextBoxSize] = useState(32);
  const [showResize, setShowResize] = useState(false);
  const [resizeW, setResizeW] = useState(0);
  const [resizeH, setResizeH] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cssWidth, setCssWidth] = useState(0);

  const snap = index >= 0 ? history[index] : null;
  const selShape = snap && selected !== null ? snap.ops[selected] : undefined;

  // Load the source image.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const base = { src: img, width: img.naturalWidth, height: img.naturalHeight };
      setHistory([{ base, ops: [] }]);
      setIndex(0);
      setResizeW(base.width);
      setResizeH(base.height);
    };
    img.onerror = () => setLoadError(true);
    img.src = imageSrc;
  }, [imageSrc]);

  function currentScale(): number {
    const c = canvasRef.current;
    if (!c || !c.width) return 1;
    return c.getBoundingClientRect().width / c.width;
  }

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snap) return;
    const drag = dragRef.current;
    const working = workingRef.current;
    const ops = drag && working ? snap.ops.map((o, i) => (i === drag.index ? working : o)) : snap.ops;
    paint(canvas, { base: snap.base, ops }, draftRef.current);
    const sel = drag && working ? working : selected !== null ? ops[selected] : undefined;
    if (sel) drawSelection(canvas, sel, currentScale());
  }, [snap, selected]);

  useEffect(() => {
    render();
  }, [render, cssWidth]);

  // Focus the text box once mounted (and again next tick, surviving the
  // browser's focus change after the mousedown that opened it).
  useEffect(() => {
    if (!textAt) return;
    textOpenedAt.current = Date.now();
    const focus = () => textInputRef.current?.focus();
    focus();
    const t = setTimeout(focus, 0);
    return () => clearTimeout(t);
  }, [textAt]);

  // Track the on-screen size of the canvas (handles are sized in screen px).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => setCssWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [snap]);

  const commit = useCallback(
    (next: Snapshot) => {
      setHistory((h) => {
        const trimmed = h.slice(0, index + 1);
        trimmed.push(next);
        return trimmed;
      });
      setIndex(index + 1);
      if (next.base !== snap?.base) {
        setResizeW(next.base.width);
        setResizeH(next.base.height);
      }
    },
    [index, snap],
  );

  const replaceOps = useCallback(
    (ops: Shape[]) => {
      if (snap) commit({ base: snap.base, ops });
    },
    [snap, commit],
  );

  const jumpTo = useCallback(
    (i: number) => {
      const s = history[i];
      if (!s) return;
      setIndex(i);
      setSelected(null);
      setResizeW(s.base.width);
      setResizeH(s.base.height);
    },
    [history],
  );
  const undo = useCallback(() => jumpTo(Math.max(0, index - 1)), [jumpTo, index]);
  const redo = useCallback(() => jumpTo(Math.min(history.length - 1, index + 1)), [jumpTo, index, history.length]);

  const deleteSelected = useCallback(() => {
    if (!snap || selected === null || !snap.ops[selected]) return;
    replaceOps(snap.ops.filter((_, i) => i !== selected));
    setSelected(null);
  }, [snap, selected, replaceOps]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!snap || selected === null || !snap.ops[selected]) return;
      replaceOps(snap.ops.map((o, i) => (i === selected ? moveShape(o, dx, dy) : o)));
    },
    [snap, selected, replaceOps],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected !== null) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === "Escape") {
        if (textAt) setTextAt(null);
        else setSelected(null);
      } else if (e.key.startsWith("Arrow") && selected !== null) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") nudgeSelected(-step, 0);
        if (e.key === "ArrowRight") nudgeSelected(step, 0);
        if (e.key === "ArrowUp") nudgeSelected(0, -step);
        if (e.key === "ArrowDown") nudgeSelected(0, step);
      } else if (e.key.toLowerCase() === "v" && !mod) {
        setTool("select");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, textAt, selected, deleteSelected, nudgeSelected]);

  function toCanvasPoint(e: { clientX: number; clientY: number }): Pt {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x: Math.max(0, Math.min(canvas.width, x)), y: Math.max(0, Math.min(canvas.height, y)) };
  }

  const tolerance = () => 8 / currentScale();

  function handleAt(shape: Shape, p: Pt): Handle | null {
    const tol = tolerance();
    const h = handlesOf(shape, bboxOf(shape)).find((h) => Math.abs(h.x - p.x) <= tol && Math.abs(h.y - p.y) <= tol);
    return h?.id ?? null;
  }

  // ---- text box -----------------------------------------------------------

  function openTextBox(at: Pt, value: string, editIndex: number | null, size: number) {
    editingTextIndex.current = editIndex;
    setTextBoxSize(size);
    setTextValue(value);
    setTextAt(at);
  }

  function commitText() {
    if (!snap || !textAt) return;
    const text = textValue.trim();
    const editIdx = editingTextIndex.current;
    editingTextIndex.current = null;
    setTextAt(null);
    if (editIdx !== null && snap.ops[editIdx]?.kind === "text") {
      const ops = text
        ? snap.ops.map((o, i) => (i === editIdx && o.kind === "text" ? { ...o, text } : o))
        : snap.ops.filter((_, i) => i !== editIdx);
      replaceOps(ops);
      setSelected(text ? editIdx : null);
      return;
    }
    if (!text) return;
    replaceOps([...snap.ops, { kind: "text", at: textAt, text, color, size: textSizeFor(width) }]);
    setSelected(snap.ops.length);
  }

  // ---- pointer handling ---------------------------------------------------

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!snap || e.button !== 0) return;
    const p = toCanvasPoint(e);
    const tol = tolerance();
    if (textAt) commitText();

    // 1. The selected object: its handles resize it, its body moves it (any tool but crop).
    if (selected !== null && tool !== "crop") {
      const shape = snap.ops[selected];
      if (shape) {
        const h = handleAt(shape, p);
        if (h) {
          dragRef.current = { kind: "resize", index: selected, handle: h, start: p, orig: shape, origBox: bboxOf(shape) };
          movedRef.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (hitShape(shape, p, tol)) {
          dragRef.current = { kind: "move", index: selected, start: p, orig: shape };
          movedRef.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // 2. Selection tool: pick the topmost object under the pointer.
    if (tool === "select") {
      const idx = hitTest(snap.ops, p, tol);
      setSelected(idx);
      if (idx !== null) {
        dragRef.current = { kind: "move", index: idx, start: p, orig: snap.ops[idx] };
        movedRef.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }

    // 3. Text tool: open a text box.
    if (tool === "text") {
      e.preventDefault();
      setSelected(null);
      openTextBox(p, "", null, textSizeFor(width));
      return;
    }

    // 4. Drawing tools.
    setSelected(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    switch (tool) {
      case "pen":
      case "highlight":
        draftRef.current = { kind: tool, points: [p], color, width };
        break;
      case "line":
      case "arrow":
      case "rect":
      case "ellipse":
        draftRef.current = { kind: tool, a: p, b: p, color, width };
        break;
      case "pixelate":
        draftRef.current = { kind: "pixelate", a: p, b: p, block: blockFor(width) };
        break;
      case "crop":
        draftRef.current = { kind: "crop", a: p, b: p };
        break;
    }
    render();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!snap) return;
    const p = toCanvasPoint(e);
    const drag = dragRef.current;
    if (drag) {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) movedRef.current = true;
      if (drag.kind === "move") {
        workingRef.current = moveShape(drag.orig, dx, dy);
      } else if ((drag.handle === "a" || drag.handle === "b") && "a" in drag.orig) {
        workingRef.current = drag.handle === "a" ? { ...drag.orig, a: p } : { ...drag.orig, b: p };
      } else {
        workingRef.current = resizeTo(drag.orig, drag.origBox, boxFromHandle(drag.origBox, drag.handle, dx, dy));
      }
      render();
      return;
    }
    const d = draftRef.current;
    if (d) {
      if (d.kind === "pen" || d.kind === "highlight") {
        const last = d.points[d.points.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) > 0.5) d.points.push(p);
      } else if ("b" in d) {
        d.b = p;
      }
      render();
      return;
    }
    // Idle: pick a cursor.
    const tol = tolerance();
    let next = tool === "select" ? "default" : "crosshair";
    if (selShape && tool !== "crop") {
      const h = handleAt(selShape, p);
      if (h) next = CURSORS[h];
      else if (hitShape(selShape, p, tol)) next = "move";
    }
    if (next !== "move" && tool === "select" && hitTest(snap.ops, p, tol) !== null) next = "move";
    if (next !== cursor) setCursor(next);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const drag = dragRef.current;
    if (drag) {
      const working = workingRef.current;
      dragRef.current = null;
      workingRef.current = null;
      if (snap && working && movedRef.current) {
        replaceOps(snap.ops.map((o, i) => (i === drag.index ? working : o)));
      } else {
        render();
      }
      return;
    }
    const d = draftRef.current;
    draftRef.current = null;
    if (!d || !snap) return;
    if (d.kind === "crop") {
      const r = norm(d.a, d.b);
      if (r.w < 2 || r.h < 2) {
        render();
        return;
      }
      const flat = flatten(snap);
      const c = document.createElement("canvas");
      const w = Math.round(r.w);
      const h = Math.round(r.h);
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(flat, r.x, r.y, r.w, r.h, 0, 0, w, h);
      commit({ base: { src: c, width: w, height: h }, ops: [] });
      setSelected(null);
      setTool("select");
      return;
    }
    if ("a" in d && "b" in d) {
      const r = norm(d.a, d.b);
      if (r.w < 1 && r.h < 1) {
        render();
        return;
      }
    }
    replaceOps([...snap.ops, d]);
    setSelected(snap.ops.length); // the new object is selected and adjustable right away
  }

  function onDoubleClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    if (!snap) return;
    const p = toCanvasPoint(e);
    const idx = hitTest(snap.ops, p, tolerance());
    const shape = idx !== null ? snap.ops[idx] : undefined;
    if (shape?.kind === "text" && idx !== null) {
      setSelected(idx);
      openTextBox(shape.at, shape.text, idx, shape.size);
    }
  }

  // ---- toolbar actions ----------------------------------------------------

  function pickColor(c: string) {
    setColor(c);
    if (snap && selected !== null && selShape && "color" in selShape) {
      replaceOps(snap.ops.map((o, i) => (i === selected && "color" in o ? { ...o, color: c } : o)));
    }
  }

  function pickWidth(w: number) {
    setWidth(w);
    if (!snap || selected === null || !selShape) return;
    replaceOps(
      snap.ops.map((o, i) => {
        if (i !== selected) return o;
        if (o.kind === "text") return { ...o, size: textSizeFor(w) };
        if (o.kind === "pixelate") return { ...o, block: blockFor(w) };
        if ("width" in o) return { ...o, width: w };
        return o;
      }),
    );
  }

  function applyResize() {
    if (!snap) return;
    const w = Math.max(1, Math.min(8000, Math.round(resizeW)));
    const h = Math.max(1, Math.min(8000, Math.round(resizeH)));
    if (w === snap.base.width && h === snap.base.height) {
      setShowResize(false);
      return;
    }
    const flat = flatten(snap);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(flat, 0, 0, w, h);
    commit({ base: { src: c, width: w, height: h }, ops: [] });
    setSelected(null);
    setShowResize(false);
  }

  function setW(v: number) {
    setResizeW(v);
    if (lockAspect && snap) setResizeH(Math.round((v * snap.base.height) / snap.base.width));
  }
  function setH(v: number) {
    setResizeH(v);
    if (lockAspect && snap) setResizeW(Math.round((v * snap.base.width) / snap.base.height));
  }

  async function save() {
    if (!snap) return;
    setSaving(true);
    setError(null);
    try {
      const flat = flatten(snap);
      const blob = await new Promise<Blob | null>((res) => flat.toBlob(res, "image/png"));
      if (!blob) throw new Error("Could not encode image");
      const form = new FormData();
      form.append("imagedata", blob, `${captureId}.png`);
      const resp = await fetch(`/api/captures/${captureId}`, { method: "PUT", body: form });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error ?? `Save failed (${resp.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const hint = useMemo(() => TOOLS.find((t) => t.id === tool)?.hint ?? "", [tool]);
  const activeBtn = "border-accent bg-accent/10 text-accent";
  const idleBtn = "border-transparent bg-transparent";

  if (loadError) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-danger">Could not load the image for editing.</p>
        <button className="btn" onClick={onClose}>Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="card flex flex-wrap items-center gap-1 p-1.5">
        <div className="flex items-center gap-0.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              aria-label={t.label}
              onClick={() => setTool(t.id)}
              className={`btn h-8 w-8 px-0 ${tool === t.id ? activeBtn : idleBtn}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
            </button>
          ))}
        </div>
        <span className="mx-0.5 h-6 w-px bg-border" />
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              title={c}
              onClick={() => pickColor(c)}
              className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-accent scale-110" : "border-border"}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <span className="mx-0.5 h-6 w-px bg-border" />
        <div className="flex items-center gap-0.5">
          {SIZES.map((s) => (
            <button
              key={s.label}
              type="button"
              title={`Stroke ${s.label}`}
              onClick={() => pickWidth(s.width)}
              className={`btn h-8 w-8 px-0 text-xs ${width === s.width ? activeBtn : idleBtn}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="mx-0.5 h-6 w-px bg-border" />
        <button className={`btn h-8 w-8 px-0 ${idleBtn}`} onClick={undo} disabled={index <= 0} title="Undo (⌘Z)" aria-label="Undo">
          <ToolIcon d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
        </button>
        <button className={`btn h-8 w-8 px-0 ${idleBtn}`} onClick={redo} disabled={index >= history.length - 1} title="Redo (⇧⌘Z)" aria-label="Redo">
          <ToolIcon d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
        </button>
        <button
          className={`btn h-8 w-8 px-0 ${idleBtn} ${selShape ? "text-danger" : ""}`}
          onClick={deleteSelected}
          disabled={!selShape}
          title="Delete selected object (Delete)"
          aria-label="Delete selected object"
        >
          <ToolIcon d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </button>
        <button
          className={`btn h-8 w-8 px-0 ${showResize ? activeBtn : idleBtn}`}
          onClick={() => setShowResize((v) => !v)}
          title="Resize image"
          aria-label="Resize image"
        >
          <ToolIcon d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn h-8" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary h-8" onClick={save} disabled={saving || !snap}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {showResize && snap ? (
        <div className="card flex flex-wrap items-end gap-3 p-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-muted">Width</span>
            <input className="input w-28" type="number" min={1} value={resizeW} onChange={(e) => setW(Number(e.target.value))} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted">Height</span>
            <input className="input w-28" type="number" min={1} value={resizeH} onChange={(e) => setH(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
            Keep aspect ratio
          </label>
          <div className="flex gap-1 pb-1">
            {[25, 50, 75].map((pct) => (
              <button
                key={pct}
                className="btn"
                onClick={() => {
                  setResizeW(Math.round((snap.base.width * pct) / 100));
                  setResizeH(Math.round((snap.base.height * pct) / 100));
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={applyResize}>Apply</button>
          <span className="pb-2 text-xs text-muted">Current: {snap.base.width}×{snap.base.height}</span>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {/* Canvas: exactly the image, nothing around it */}
      <div className="flex items-start justify-center overflow-auto p-2">
        <div className="relative inline-block max-w-full">
          {snap ? <Corners size={16} inset={-8} /> : null}
          <canvas
            ref={canvasRef}
            className="block max-h-[78vh] max-w-full touch-none select-none"
            style={{ width: "auto", height: "auto", cursor }}
            // Keep focus where it is (in the text box) when clicking the canvas.
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
          />
          {!snap ? <div className="p-16 text-sm text-muted">Loading image…</div> : null}
          {textAt && snap ? (
            <input
              ref={textInputRef}
              autoFocus
              className="absolute rounded border border-accent bg-[#fffaf0]/95 px-1 text-black outline-none"
              style={{
                left: `${(textAt.x / snap.base.width) * 100}%`,
                top: `${(textAt.y / snap.base.height) * 100}%`,
                fontSize: `${Math.max(12, (textBoxSize * (cssWidth || snap.base.width)) / snap.base.width)}px`,
                minWidth: "4ch",
                // Never wider than the space left on the canvas, so the page does not scroll.
                maxWidth: `${Math.max(10, 100 - (textAt.x / snap.base.width) * 100)}%`,
                boxSizing: "border-box",
              }}
              placeholder="Type, then Enter"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitText();
                }
                if (e.key === "Escape") {
                  editingTextIndex.current = null;
                  setTextAt(null);
                }
              }}
              onBlur={() => {
                // Ignore the blur the browser fires right after the box opens.
                if (Date.now() - textOpenedAt.current < 400) {
                  setTimeout(() => textInputRef.current?.focus(), 0);
                  return;
                }
                commitText();
              }}
            />
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted">
        {hint}. Objects stay editable until you crop, resize or save: click one to select it, drag to move, drag the
        handles to resize, Delete removes it, arrow keys nudge, V switches to Select. ⌘Z undo, ⇧⌘Z redo.
      </p>
    </div>
  );
}
