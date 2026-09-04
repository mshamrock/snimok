import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { Corners } from "@/components/Corners";
import { getCurrentUser } from "@/lib/auth";

const STEPS = [
  {
    n: "01",
    t: "Select an area",
    d: "Click the Snimok icon or press ⌘⇧7. The cursor becomes a crosshair – drag over the part of the screen you want.",
  },
  {
    n: "02",
    t: "The link opens",
    d: "The image uploads in the background; its URL opens in your browser and lands in the clipboard. No account needed.",
  },
  {
    n: "03",
    t: "Edit, tag, find",
    d: "Draw arrows, blur secrets, crop and resize. Every capture is searchable by the text on it, the app it came from and your tags.",
  },
];

export default async function Home() {
  if (await getCurrentUser()) redirect("/captures");
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-14">
        <section className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div className="space-y-6">
            <p className="label">macOS 13+ · ⌘⇧7 area · ⌘⇧8 window</p>
            <h1 className="text-[44px] font-semibold leading-[1.05] tracking-tight text-balance sm:text-[56px]">
              Screenshot.<br />Link.<br />Done.
            </h1>
            <p className="max-w-md text-lg text-muted">
              Drag over any part of your screen; a link to the image opens instantly. Edit it, tag it,
              and find it later by the text on it.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/download" className="btn btn-primary px-5 py-2.5 text-base">
                Download for Mac
              </Link>
              <Link href="/register" className="btn px-5 py-2.5 text-base">
                Create account
              </Link>
            </div>
          </div>

          {/* A capture, as it looks on its page */}
          <div className="relative rounded-lg bg-stage p-6 ring-1 ring-border">
            <div className="relative mx-auto max-w-[360px]">
              <Corners size={16} inset={-8} />
              <div className="aspect-[16/10] overflow-hidden rounded-sm bg-[#f7f7fa] text-[#1a1a1a] shadow-[0_1px_0_rgba(0,0,0,.08)]">
                <div className="flex h-[10%] items-center gap-1.5 bg-[#e9e9ef] px-2">
                  <i className="h-1.5 w-1.5 rounded-full bg-[#d0d0d8]" />
                  <i className="h-1.5 w-1.5 rounded-full bg-[#d0d0d8]" />
                  <i className="h-1.5 w-1.5 rounded-full bg-[#d0d0d8]" />
                  <i className="ml-2 h-[45%] flex-1 rounded-sm bg-white" />
                </div>
                <div className="grid gap-2 p-4">
                  <div className="h-3 w-2/5 rounded-sm bg-[#1a1a1a]/85" />
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`grid gap-1.5 rounded border p-2 ${i === 1 ? "border-accent" : "border-[#e4e4ec]"}`}>
                        <div className="h-2.5 w-3/5 rounded-sm bg-[#1a1a1a]/80" />
                        <div className="h-1 rounded-sm bg-[#ececf1]" />
                        <div className="h-1 w-4/5 rounded-sm bg-[#ececf1]" />
                        <div className={`mt-1 h-2.5 rounded-sm ${i === 1 ? "bg-accent" : "bg-[#dfe3f0]"}`} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="label pt-0.5">Image</dt>
              <dd className="data text-[13px]">1470×812 · 236 KB · PNG</dd>
              <dt className="label pt-0.5">App</dt>
              <dd>Google Chrome</dd>
              <dt className="label pt-0.5">Source</dt>
              <dd className="truncate">Pricing – Gyazo <span className="data ml-2 text-muted">gyazo.com</span></dd>
              <dt className="label pt-0.5">Tags</dt>
              <dd className="font-mono text-[12px]">#pricing #competitors</dd>
            </dl>
          </div>
        </section>

        <section className="mt-24 grid gap-8 border-t border-border pt-10 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="space-y-2">
              <div className="label text-accent">{s.n}</div>
              <h2 className="text-lg font-semibold">{s.t}</h2>
              <p className="text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
