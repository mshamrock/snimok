import Link from "next/link";
import { Icon } from "./Icon";
import type { Facet } from "@/lib/captures";

type Kind = "tag" | "app" | "site";

const META: Record<Kind, { title: string; icon: string; param: string; prefix: string; empty: string }> = {
  tag: { title: "Tags", icon: "hash", param: "tag", prefix: "#", empty: "No tags yet. Open any capture and add tags under the image." },
  app: { title: "Apps", icon: "apps", param: "app", prefix: "", empty: "No apps yet. The Mac app records which application each capture came from." },
  site: { title: "Sites", icon: "globe", param: "site", prefix: "", empty: "No sites yet. Captures taken in a browser remember the page they came from." },
};

/** A browsable index (tags / apps / sites) with counts, filterable by name. */
export function FacetPage({ kind, facets, q }: { kind: Kind; facets: Facet[]; q?: string }) {
  const m = META[kind];
  const nf = new Intl.NumberFormat("en");
  const needle = q?.trim().toLowerCase();
  const shown = needle ? facets.filter((f) => f.name.toLowerCase().includes(needle)) : facets;
  const total = facets.reduce((s, f) => s + f.n, 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{m.title}</h1>
          <p className="label">
            {nf.format(facets.length)} {m.title.toLowerCase()} · {nf.format(total)} captures
          </p>
        </div>
        <form className="relative w-full sm:w-64">
          <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input className="input py-1.5 pl-9" name="q" defaultValue={q ?? ""} placeholder={`Filter ${m.title.toLowerCase()}`} />
        </form>
      </div>

      {facets.length === 0 ? (
        <p className="py-16 text-center text-muted">{m.empty}</p>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-muted">
          Nothing matches “{q}”. <Link href={`/${m.title.toLowerCase()}`} className="underline">Show all</Link>
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((f) => (
            <li key={f.name}>
              <Link
                href={`/captures?${m.param}=${encodeURIComponent(f.name)}`}
                className="card group flex items-center gap-3 px-3 py-2.5 transition-colors hover:border-accent/60"
              >
                <Icon name={m.icon} className="h-4 w-4 shrink-0 text-muted group-hover:text-accent" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.prefix}
                  {f.name}
                </span>
                <span className="data text-[11px] text-muted">{nf.format(f.n)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
