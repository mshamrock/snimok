import Link from "next/link";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { organizationLd, pageMetadata, SITE_URL, softwareApplicationLd } from "@/lib/site";

const TITLE = "A free Gyazo alternative for Mac";
const DESCRIPTION =
  "Snimok works like Gyazo — select an area, get a link — but keeps every capture browsable, searchable by its text and editable for free. Import your whole Gyazo library with the original dates.";

export const metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: "/gyazo-alternative" });

type Cell = string | { text: string; good?: boolean };
const ROWS: { feature: string; snimok: Cell; free: Cell; pro: Cell }[] = [
  { feature: "Price", snimok: { text: "Free", good: true }, free: "Free", pro: "Paid subscription" },
  { feature: "Browse all past captures", snimok: { text: "Yes", good: true }, free: "Latest 10 on the Captures page", pro: "Yes" },
  { feature: "Search by text on the image (OCR)", snimok: { text: "Yes", good: true }, free: "No", pro: "Yes" },
  { feature: "Annotate, crop and resize", snimok: { text: "Yes", good: true }, free: "Pro feature", pro: "Yes" },
  { feature: "Search by app, page and date", snimok: { text: "Yes", good: true }, free: "Pro feature", pro: "Yes" },
  { feature: "Ads", snimok: { text: "None", good: true }, free: "Shown", pro: "None" },
  { feature: "GIF recording", snimok: { text: "Yes, up to 15 s", good: true }, free: "Yes", pro: "Yes, longer" },
  { feature: "Video recording", snimok: "No", free: "Yes", pro: "Yes" },
  { feature: "Password-protected captures", snimok: "No (“Only me” instead)", free: "No", pro: "Yes" },
  { feature: "Platforms", snimok: "macOS 13+", free: "Windows, macOS, browser extensions", pro: "Windows, macOS, browser extensions" },
  { feature: "Bring your Gyazo library", snimok: { text: "Import with original dates", good: true }, free: "—", pro: "Export of all uploads" },
];

function Value({ cell }: { cell: Cell }) {
  const c = typeof cell === "string" ? { text: cell } : cell;
  return <span className={c.good ? "text-foreground" : "text-muted"}>{c.text}</span>;
}

export default function GyazoAlternativePage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-14 px-4 pb-20 pt-14">
        <header className="space-y-5">
          <p className="label">Snimok vs Gyazo · updated October 2026</p>
          <h1 className="text-[36px] font-semibold leading-[1.1] tracking-tight text-balance sm:text-[44px]">
            {TITLE}
          </h1>
          <p className="max-w-2xl text-lg text-muted">
            Snimok was built to feel exactly like Gyazo: click the icon or press ⌘⇧7, drag over the screen, and the
            link opens in your browser and lands in the clipboard. The difference is what happens afterwards —
            every capture stays browsable, searchable by the text on it and editable, without a subscription.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/download" className="btn btn-primary px-5 py-2.5 text-base">Download for Mac</Link>
            <Link href="/register" className="btn px-5 py-2.5 text-base">Create account</Link>
          </div>
        </header>

        <section aria-labelledby="same" className="space-y-4">
          <h2 id="same" className="text-xl font-semibold">What works the same as Gyazo</h2>
          <ul className="grid gap-3 text-sm text-muted sm:grid-cols-2">
            <li className="card p-4"><b className="text-foreground">One gesture, one link.</b> Area capture on ⌘⇧7, window on ⌘⇧9, GIF on ⌘⇧8. The link opens and is copied automatically.</li>
            <li className="card p-4"><b className="text-foreground">A page for every capture.</b> Share menu (link, image URL, Markdown, HTML), copy image, download, delete, ← → through your timeline.</li>
            <li className="card p-4"><b className="text-foreground">Context saved with the image.</b> The app, window title and, in browsers, the page address you captured from.</li>
            <li className="card p-4"><b className="text-foreground">Tags and descriptions.</b> Add them on the capture page; the app you captured from is tagged automatically.</li>
          </ul>
        </section>

        <section aria-labelledby="compare" className="space-y-4">
          <h2 id="compare" className="text-xl font-semibold">Snimok and Gyazo compared</h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="label px-4 py-3 text-left font-normal">Feature</th>
                  <th className="label px-4 py-3 text-left font-normal text-accent">Snimok</th>
                  <th className="label px-4 py-3 text-left font-normal">Gyazo free</th>
                  <th className="label px-4 py-3 text-left font-normal">Gyazo Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ROWS.map((r) => (
                  <tr key={r.feature}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">{r.feature}</th>
                    <td className="px-4 py-2.5"><Value cell={r.snimok} /></td>
                    <td className="px-4 py-2.5"><Value cell={r.free} /></td>
                    <td className="px-4 py-2.5"><Value cell={r.pro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Gyazo features as listed on{" "}
            <a href="https://gyazo.com/pricing" className="underline" rel="noopener nofollow">gyazo.com/pricing</a> and in{" "}
            <a
              href="https://help.gyazo.com/Free%20users%20have%20image%20viewing%20restrictions-619f1f90855387001d0792e9"
              className="underline"
              rel="noopener nofollow"
            >
              Gyazo Help
            </a>{" "}
            in October 2026; check there for current plans. Gyazo is a trademark of its owner; Snimok is an independent project.
          </p>
        </section>

        <section aria-labelledby="move" className="space-y-4">
          <h2 id="move" className="text-xl font-semibold">How to move your Gyazo library to Snimok</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>
              Create a Gyazo access token at{" "}
              <a href="https://gyazo.com/oauth/applications" className="underline" rel="noopener nofollow">gyazo.com/oauth/applications</a>{" "}
              (New application → “Your access token”).
            </li>
            <li><Link href="/register" className="underline">Create a Snimok account</Link> and open Settings → Import from Gyazo.</li>
            <li>
              Paste the token and press Import. Every capture is copied with its original date, app, page title, address and
              recognised text, and tagged <code className="font-mono text-[13px]">#gyazo</code>. The token is used only while the page
              runs and is never stored.
            </li>
            <li>Large libraries take a while; if the import stops, press the button again and it continues where it left off.</li>
          </ol>
        </section>

        <section aria-labelledby="who" className="space-y-3">
          <h2 id="who" className="text-xl font-semibold">When Gyazo is still the better choice</h2>
          <p className="text-sm text-muted">
            Snimok is a Mac app. If you capture on Windows or need video recordings rather than GIFs, Gyazo covers that and
            Snimok does not yet.
          </p>
        </section>
      </main>
      <SiteFooter />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            organizationLd(),
            softwareApplicationLd(),
            {
              "@type": "WebPage",
              "@id": `${SITE_URL}/gyazo-alternative#page`,
              url: `${SITE_URL}/gyazo-alternative`,
              name: TITLE,
              description: DESCRIPTION,
              dateModified: "2026-10-14",
              about: { "@id": `${SITE_URL}/#app` },
              publisher: { "@id": `${SITE_URL}/#org` },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Snimok", item: `${SITE_URL}/` },
                { "@type": "ListItem", position: 2, name: "Gyazo alternative", item: `${SITE_URL}/gyazo-alternative` },
              ],
            },
          ],
        }}
      />
    </>
  );
}
