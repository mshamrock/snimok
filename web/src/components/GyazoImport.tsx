"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type Failed = { id: string; error: string };
type Progress = {
  imported: number;
  skipped: number;
  failed: Failed[];
  total: number | null;
  pages: number | null;
  page: number;
  userType: string | null;
  processed: number;
  retrying: string | null;
};
type Cursor = { page: number; offset: number };
type ImportResponse = {
  error?: string;
  total: number | null;
  pages: number | null;
  page: number;
  userType: string | null;
  imported: number;
  skipped: number;
  failed: Failed[];
  done: boolean;
  next: Cursor | null;
};

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000, 90_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives /api/import/gyazo page by page. Transient failures (rate limit,
 * timeouts, network hiccups) are retried with backoff instead of stopping the
 * whole import; already-imported captures are skipped server-side, so the
 * button can simply be pressed again to resume or retry failures.
 */
export function GyazoImport() {
  const [token, setToken] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const cancelRef = useRef(false);

  async function step(cursor: Cursor, acc: Progress): Promise<ImportResponse> {
    for (let attempt = 0; ; attempt++) {
      if (cancelRef.current) throw new Error("Stopped.");
      let res: Response | null = null;
      let data: ImportResponse | null = null;
      let failure: string | null = null;
      try {
        res = await fetch("/api/import/gyazo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, ...cursor }),
        });
        data = (await res.json().catch(() => null)) as ImportResponse | null;
        if (res.ok && data) return data;
        failure = data?.error ?? `Import failed (${res.status})`;
      } catch (e) {
        failure = e instanceof Error ? e.message : "Network error";
      }
      const status = res?.status ?? 0;
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw new Error(failure ?? "Import failed");
      const wait = RETRY_DELAYS_MS[attempt];
      setProgress({ ...acc, retrying: `${failure} · retrying in ${Math.round(wait / 1000)} s (page ${cursor.page})` });
      await sleep(wait);
    }
  }

  async function run() {
    setError(null);
    setDone(false);
    setRunning(true);
    cancelRef.current = false;
    const acc: Progress = {
      imported: 0, skipped: 0, failed: [], total: null, pages: null, page: 1, userType: null, processed: 0, retrying: null,
    };
    setProgress({ ...acc });
    let cursor: Cursor | null = { page: 1, offset: 0 };
    try {
      while (cursor && !cancelRef.current) {
        const data = await step(cursor, acc);
        acc.imported += data.imported;
        acc.skipped += data.skipped;
        acc.failed.push(...data.failed);
        acc.processed += data.imported + data.skipped + data.failed.length;
        acc.total = data.total ?? acc.total;
        acc.pages = data.pages ?? acc.pages;
        acc.page = data.page;
        acc.userType = data.userType ?? acc.userType;
        acc.retrying = null;
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
  const nf = new Intl.NumberFormat("en");

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
        import and is not stored. Keep this tab open; if the import stops, press the button again and
        it continues where it left off, skipping what is already here.
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
            {progress ? "Continue import" : "Import from Gyazo"}
          </button>
        )}
      </form>

      {progress ? (
        <div className="space-y-2 text-sm">
          <div className="h-2 overflow-hidden rounded bg-background">
            <div
              className={`h-full bg-accent transition-all ${running && pct === null ? "w-1/3 animate-pulse" : ""}`}
              style={pct !== null ? { width: `${pct}%` } : undefined}
            />
          </div>
          <p className="data text-[12px] text-muted">
            {progress.total !== null ? `Gyazo reports ${nf.format(progress.total)} captures` : "Gyazo did not report a total"}
            {progress.pages ? ` · page ${progress.page} of ${progress.pages}` : ` · page ${progress.page}`}
            {progress.userType ? ` · plan: ${progress.userType}` : ""}
          </p>
          <p>
            {nf.format(progress.imported)} imported
            {progress.skipped ? `, ${nf.format(progress.skipped)} skipped (already imported or no image file)` : ""}
            {progress.failed.length ? `, ${nf.format(progress.failed.length)} failed` : ""}
            {progress.total ? ` · ${nf.format(progress.processed)} of ${nf.format(progress.total)} processed` : ""}
            {running ? " · working…" : ""}
          </p>
          {progress.retrying ? <p className="text-muted">{progress.retrying}</p> : null}
          {done ? (
            <p className="text-green-600">
              Import finished.{" "}
              <Link href="/captures?tag=gyazo" className="underline">
                Open the imported captures
              </Link>
              .{progress.failed.length ? " Press the button again to retry the failed ones." : ""}
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
      {error ? (
        <p className="text-sm text-danger">
          {error} {progress && !done ? "— press “Continue import” to resume." : ""}
        </p>
      ) : null}
    </div>
  );
}
