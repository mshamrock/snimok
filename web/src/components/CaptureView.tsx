"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Editor } from "./editor/Editor";
import { Icon } from "./Icon";
import { Corners } from "./Corners";
import { updateCapture } from "@/app/i/[id]/actions";

export type CaptureDTO = {
  id: string;
  url: string;
  contentType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  title: string | null;
  description: string | null;
  tags: string[];
  app: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  ocrText: string | null;
  accessPolicy: "anyone" | "only_me";
  createdAt: string;
  updatedAt: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy:", text);
    return false;
  }
}

export function CaptureView({
  capture,
  permalink,
  isOwner,
  ownerLabel,
  neighbors,
  tagSuggestions,
}: {
  capture: CaptureDTO;
  permalink: string;
  isOwner: boolean;
  ownerLabel: string;
  neighbors: { newer: string | null; older: string | null };
  tagSuggestions: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, startSave] = useTransition();
  const [title, setTitle] = useState(capture.title ?? "");
  const [description, setDescription] = useState(capture.description ?? "");
  const [tags, setTags] = useState<string[]>(capture.tags);
  const [tagInput, setTagInput] = useState("");
  const [policy, setPolicy] = useState(capture.accessPolicy);
  const [menu, setMenu] = useState<null | "share" | "access">(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const created = new Date(capture.createdAt);
  const dateLabel = created.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
  const dayKey = created.toISOString().slice(0, 10);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  // Close menus on outside click / Escape.
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  // ← → move through the timeline.
  useEffect(() => {
    if (editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft" && neighbors.newer) router.push(`/i/${neighbors.newer}`);
      if (e.key === "ArrowRight" && neighbors.older) router.push(`/i/${neighbors.older}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, neighbors, router]);

  function save(patch: Parameters<typeof updateCapture>[1]) {
    startSave(async () => {
      const res = await updateCapture(capture.id, patch);
      if (!res.ok) notify(res.error);
      else if (res.tags && patch.tags) setTags(res.tags);
    });
  }

  function addTag(raw: string) {
    const t = raw.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-");
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    save({ tags: next });
  }
  function removeTag(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    save({ tags: next });
  }
  function setAccess(p: "anyone" | "only_me") {
    setPolicy(p);
    setMenu(null);
    save({ accessPolicy: p });
    notify(p === "only_me" ? "Only you can open this link" : "Anyone with the link can view");
  }

  async function remove() {
    if (!confirm("Delete this screenshot permanently?")) return;
    setBusy(true);
    const res = await fetch(`/api/captures/${capture.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.push(neighbors.older ? `/i/${neighbors.older}` : "/captures");
    else notify("Could not delete the image.");
  }

  async function copyImage() {
    try {
      const res = await fetch(`/api/captures/${capture.id}/raw`);
      const blob = await res.blob();
      let png = blob;
      if (blob.type !== "image/png") {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d")!.drawImage(bmp, 0, 0);
        png = await new Promise<Blob>((res, rej) =>
          c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/png"),
        );
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      notify("Image copied");
    } catch {
      notify("Your browser blocked copying the image");
    }
  }

  if (editing) {
    return (
      <Editor
        captureId={capture.id}
        imageSrc={`/api/captures/${capture.id}/raw?v=${encodeURIComponent(capture.updatedAt)}`}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  const suggestions = tagSuggestions.filter((t) => !tags.includes(t)).slice(0, 8);
  const toolBtn =
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-foreground transition-colors hover:bg-card-2 disabled:opacity-50";
  const menuCls =
    "absolute right-0 top-full z-20 mt-1 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-card py-1 text-sm shadow-xl";

  return (
    <div className="space-y-4">

      {/* Stage: the image is the hero, the chrome recedes */}
      <div className="relative overflow-hidden rounded-lg bg-stage ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            {isOwner ? (
              <input
                className="w-full max-w-xl bg-transparent text-base font-medium outline-none placeholder:text-muted/70"
                placeholder="Add a title…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if ((capture.title ?? "") !== title.trim()) save({ title });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <h1 className="truncate text-base font-medium">{capture.title ?? "Screenshot"}</h1>
            )}
          </div>
          <div className="relative flex flex-wrap items-center gap-1.5">
            <button
              className={toolBtn}
              onClick={(e) => {
                e.stopPropagation();
                setMenu(menu === "share" ? null : "share");
              }}
            >
              <Icon name="share" /> Share
            </button>
            {menu === "share" ? (
                <div className={menuCls} onClick={(e) => e.stopPropagation()}>
                  {[
                    ["Copy link", permalink],
                    ["Copy image URL", capture.url],
                    ["Copy Markdown", `![${capture.title ?? "screenshot"}](${capture.url})`],
                    ["Copy HTML", `<a href="${permalink}"><img src="${capture.url}" alt="${capture.title ?? ""}"></a>`],
                  ].map(([label, text]) => (
                    <button
                      key={label}
                      className="block w-full px-3 py-1.5 text-left hover:bg-card-2"
                      onClick={async () => {
                        if (await copyText(text)) notify(`${label.replace("Copy ", "")} copied`);
                        setMenu(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <a
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-card-2"
                    href={capture.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open image <Icon name="external" className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : null}

            {isOwner ? (
              <>
                <button className={toolBtn} title="Edit image" aria-label="Edit image" onClick={() => setEditing(true)}>
                  <Icon name="edit" />
                </button>
                  <button
                    className={`${toolBtn} ${policy === "only_me" ? "text-accent" : ""}`}
                    title={policy === "only_me" ? "Only you can view" : "Anyone with the link can view"}
                    aria-label="Who can view"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu === "access" ? null : "access");
                    }}
                  >
                    <Icon name={policy === "only_me" ? "lock" : "unlock"} />
                  </button>
                  {menu === "access" ? (
                    <div className={`${menuCls} w-64`} onClick={(e) => e.stopPropagation()}>
                      <div className="label px-3 py-1.5">Who can view</div>
                      {(
                        [
                          ["anyone", "Anyone with the link"],
                          ["only_me", "Only me"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-card-2"
                          onClick={() => setAccess(value)}
                        >
                          {label}
                          {policy === value ? <Icon name="check" className="h-4 w-4 text-accent" /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
              </>
            ) : null}

            <button className={toolBtn} title="Copy image to clipboard" aria-label="Copy image" onClick={copyImage}>
              <Icon name="copy" />
            </button>
            <a
              className={toolBtn}
              title="Download"
              aria-label="Download"
              href={`/r/${capture.id}?download=1`}
            >
              <Icon name="download" />
            </a>
            {isOwner ? (
              <button className={`${toolBtn} hover:text-danger`} title="Delete" aria-label="Delete" onClick={remove} disabled={busy}>
                <Icon name="trash" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="relative flex min-h-[40vh] items-center justify-center px-14 py-8">
          {neighbors.newer ? (
            <Link
              href={`/i/${neighbors.newer}`}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card p-2 text-muted transition-colors hover:text-foreground"
              title="Newer (←)"
            >
              <Icon name="left" className="h-5 w-5" />
            </Link>
          ) : null}
          <span className="relative inline-block max-w-full">
            <Corners size={16} inset={-8} />
            <a href={capture.url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capture.url}
                alt={capture.title ?? "Screenshot"}
                width={capture.width ?? undefined}
                height={capture.height ?? undefined}
                className="max-h-[72vh] w-auto max-w-full object-contain"
              />
            </a>
          </span>
          {neighbors.older ? (
            <Link
              href={`/i/${neighbors.older}`}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card p-2 text-muted transition-colors hover:text-foreground"
              title="Older (→)"
            >
              <Icon name="right" className="h-5 w-5" />
            </Link>
          ) : null}
        </div>

        {toast ? (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1.5 text-sm shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-mono text-[12px]"
          >
            <Link href={`/captures?tag=${encodeURIComponent(t)}`} className="hover:text-accent">
              #{t}
            </Link>
            {isOwner ? (
              <button className="text-muted hover:text-danger" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>
                <Icon name="close" className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
        {isOwner ? (
          <>
            <input
              className="input w-36 py-1 font-mono text-[12px]"
              placeholder="Add tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                  setTagInput("");
                }
              }}
              onBlur={() => {
                if (tagInput.trim()) {
                  addTag(tagInput);
                  setTagInput("");
                }
              }}
            />
            {suggestions.map((t) => (
              <button
                key={t}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 font-mono text-[12px] text-muted hover:border-accent hover:text-accent"
                onClick={() => addTag(t)}
              >
                <Icon name="plus" className="h-3 w-3" /> #{t}
              </button>
            ))}
          </>
        ) : null}
        {!isOwner && tags.length === 0 ? <span className="text-sm text-muted">No tags</span> : null}
      </div>

      {/* Description */}
      {isOwner ? (
        <textarea
          className="input min-h-[56px] resize-y"
          placeholder="Type a description for search"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if ((capture.description ?? "") !== description.trim()) save({ description });
          }}
        />
      ) : capture.description ? (
        <p className="text-sm whitespace-pre-wrap">{capture.description}</p>
      ) : null}

      {/* Metadata */}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-2.5 border-t border-border pt-4 text-sm">
        <dt className="label pt-0.5">User</dt>
        <dd>{ownerLabel}</dd>
        <dt className="label pt-0.5">Uploaded</dt>
        <dd className="data text-[13px]">
          {isOwner ? (
            <Link href={`/captures?day=${dayKey}`} className="underline decoration-border decoration-dotted underline-offset-4 hover:decoration-accent">
              {dateLabel}
            </Link>
          ) : (
            dateLabel
          )}
          {saving ? <span className="ml-2 text-xs text-muted">saving…</span> : null}
        </dd>
        {capture.app ? (
          <>
            <dt className="label pt-0.5">App</dt>
            <dd>
              {isOwner ? (
                <Link href={`/captures?app=${encodeURIComponent(capture.app)}`} className="underline decoration-border decoration-dotted underline-offset-4 hover:decoration-accent">
                  {capture.app}
                </Link>
              ) : (
                capture.app
              )}
            </dd>
          </>
        ) : null}
        {capture.sourceTitle || capture.sourceUrl ? (
          <>
            <dt className="label pt-0.5">Source</dt>
            <dd className="min-w-0 truncate">
              {capture.sourceUrl ? (
                <a href={capture.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:decoration-accent">
                  {capture.sourceTitle ?? hostOf(capture.sourceUrl)}
                </a>
              ) : (
                capture.sourceTitle
              )}
              {capture.sourceUrl && capture.sourceTitle ? (
                <span className="data ml-2 text-muted">{hostOf(capture.sourceUrl)}</span>
              ) : null}
            </dd>
          </>
        ) : null}
        <dt className="label pt-0.5">Image</dt>
        <dd className="data text-[13px]">
          {capture.width && capture.height ? `${capture.width}×${capture.height} · ` : ""}
          {formatBytes(capture.sizeBytes)} · {capture.contentType.replace("image/", "").toUpperCase()}
        </dd>
        <dt className="label pt-0.5">Link</dt>
        <dd className="data min-w-0 truncate text-[13px]">
          <a className="underline decoration-border underline-offset-4 hover:decoration-accent" href={permalink}>{permalink}</a>
          {policy === "only_me" ? <span className="label ml-2 text-accent">only you</span> : null}
        </dd>
        {capture.ocrText ? (
          <>
            <dt className="label pt-0.5">Text</dt>
            <dd>
              <details>
                <summary className="cursor-pointer text-muted hover:text-foreground">Recognized text</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 font-mono text-xs">
                  {capture.ocrText}
                </pre>
              </details>
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
