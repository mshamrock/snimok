import { Header } from "@/components/Header";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

export const metadata = { title: "Download" };

export default function DownloadPage() {
  const zipPath = path.join(process.cwd(), "public", "Snimok.zip");
  const hasBinary = existsSync(zipPath);
  const zipInfo = hasBinary ? statSync(zipPath) : null;
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <section className="card p-6 space-y-4">
          <h1 className="text-2xl font-semibold">Snimok for Mac</h1>
          <p className="text-sm text-muted">
            A tiny menu-bar app. Click its icon (or press ⌘⇧7), drag over an
            area of the screen, and the link opens in your browser and is
            copied to the clipboard. Requires macOS 13 or newer.
          </p>
          {hasBinary && zipInfo ? (
            <div className="flex flex-wrap items-center gap-3">
              <a href="/Snimok.zip" className="btn btn-primary px-5 py-2.5 text-base" download>
                Download Snimok for Mac
              </a>
              <span className="text-xs text-muted">
                Snimok.zip · {(zipInfo.size / 1024).toFixed(0)} KB · Universal (Apple Silicon + Intel) · macOS 13+
                {" · "}built {zipInfo.mtime.toISOString().slice(0, 10)}
              </span>
            </div>
          ) : (
            <p className="text-sm">
              The binary isn&apos;t bundled with this deployment – build it from
              the <code className="font-mono">desktop/</code> folder (below).
            </p>
          )}
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Unzip and drag <b>Snimok.app</b> into Applications.</li>
            <li>
              First launch: the app is signed with a personal certificate, not
              notarised by Apple, so macOS will refuse a double-click. Right-click
              the app → <b>Open</b> → <b>Open</b> again (or run{" "}
              <code className="font-mono text-xs">
                xattr -dr com.apple.quarantine /Applications/Snimok.app
              </code>
              ). This is needed once.
            </li>
            <li>
              Allow <b>Screen Recording</b> when macOS asks (System Settings →
              Privacy &amp; Security).
            </li>
            <li>
              Click the Snimok icon or press ⌘⇧7 and drag over an area. The
              link opens in your browser and is copied to the clipboard. Signing
              in is optional: use the menu bar icon → “Sign In…” to attach the
              app to your account.
            </li>
          </ol>
        </section>

        <section className="card p-6 space-y-3">
          <h2 className="text-lg font-semibold">Build from source</h2>
          <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs font-mono">
{`cd desktop
SNIMOK_SERVER_URL=https://your-domain.vercel.app ./build.sh
open build/`}
          </pre>
          <p className="text-sm text-muted">
            Needs Xcode command line tools. The script produces{" "}
            <code className="font-mono">build/Snimok.app</code> and{" "}
            <code className="font-mono">build/Snimok.zip</code>.
          </p>
        </section>
      </main>
    </>
  );
}
