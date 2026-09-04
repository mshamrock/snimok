"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type Progress = { imported: number; skipped: number; failed: { id: string; error: string }[]; total: number | null; processed: number };
type Cursor = { page: number; offset: number };
type ImportResponse = {
  error?: string;
  total: number | null;
  imported: number;
  skipped: number;
  failed: { id: string; error: string }[];
  done: boolean;
  next: Cursor | null;
};

export function GyazoImport() {
  const [token, setToken] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  async function run() {
    setError(null);
    setDone(false);
    setRunning(true);
    cancelRef.current = false;
    const acc: Progress = { imported: 0, skipped: 0, failed: [], total: null, processed: 0 };
    setProgress({ ...acc });
    let cursor: Cursor | null = { page: 1, offset: 0 };
    try {
      while (cursor && !cancelRef.current) {
        const res: Response = await fetch("/api/import/gyazo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, ...cursor }),
        });
        const data = (await res.json()) as ImportResponse;
        if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`);
        acc.imported += data.imported;
        acc.skipped += data.skipped;
        acc.failed.push(...data.failed);
        acc.processed += data.imported + data.skipped + data.failed.length;
        acc.total = data.total ?? acc.total;
        setProgress({ ...acc, failed: [...acc.failed] });
        cursor = data.next;
      }
      if (!cancelRef.current) setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setRunning(false);
    }
  }

  const pct = progress?.total ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Copies your whole Gyazo library here with dates, app, page title and URL, description and
        recognised text; every imported capture gets the tag <code className="font-mono">#gyazo</code>.
        Get a token at{" "}
        <a className="underline" href="https://gyazo.com/oauth/applications" target="_blank" rel="noreferrer">
          gyazo.com/oauth/applications
        </a>{" "}
        (New application → “Your access token”). The token is used only while this page runs the
        import and is not stored.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!running) void run();
        }}
      >
        <input
          className="input font-mono"
          type="password"
          placeholder="Gyazo access token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={running}
          autoComplete="off"
        />
        {running ? (
          <button type="button" className="btn shrink-0" onClick={() => (cancelRef.current = true)}>
            Stop
          </button>
        ) : (
          <button className="btn btn-primary shrink-0" disabled={token.trim().length < 16}>
            Import from Gyazo
          </button>
        )}
      </form>

      {progress ? (
        <div className="space-y-2 text-sm">
          <div className="h-2 overflow-hidden rounded bg-background">
            <div
              className={`h-full bg-accent transition-all ${running && pct === null ? "animate-pulse w-1/3" : ""}`}
              style={pct !== null ? { width: `${pct}%` } : undefined}
            />
          </div>
          <p>
            {progress.imported} imported
            {progress.skipped ? `, ${progress.skipped} skipped (already imported or no image file)` : ""}
            {progress.failed.length ? `, ${progress.failed.length} failed` : ""}
            {progress.total ? ` · ${progress.processed} of ${progress.total} processed` : ""}
            {running ? " · working…" : ""}
          </p>
          {done ? (
            <p className="text-green-600">
              Import finished.{" "}
              <Link href="/captures?tag=gyazo" className="underline">
                Open the imported captures
              </Link>
              .
            </p>
          ) : null}
          {progress.failed.length ? (
            <details>
              <summary className="cursor-pointer text-muted">Failed items</summary>
              <ul className="mt-1 max-h-40 overflow-auto font-mono text-xs">
                {progress.failed.map((f) => (
                  <li key={f.id}>
                    {f.id}: {f.error}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
