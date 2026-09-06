"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "./Icon";

/** "+" in the library toolbar: upload an image from disk into the timeline. */
export function UploadButton() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("imagedata", file, file.name);
      form.set("title", file.name.replace(/\.[a-z0-9]+$/i, ""));
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? `Upload failed (${res.status})`);
      router.push(`/i/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        type="button"
        className="btn"
        title="Upload an image"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Icon name={busy ? "upload" : "plus"} className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
        <span className="hidden sm:inline">{busy ? "Uploading…" : "Upload"}</span>
      </button>
      {error ? (
        <p role="alert" className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-danger/40 bg-card p-2 text-xs text-danger shadow-lg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
