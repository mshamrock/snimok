import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { Corners } from "@/components/Corners";
import { getCurrentUser } from "@/lib/auth";
import { deviceIdFromRequest, imageUrl, listCaptures } from "@/lib/captures";
import type { Capture } from "@/db/schema";

export const metadata = { title: "Captures" };

const PAGE = 60;

function groupByDay(items: Capture[]) {
  const groups: { key: string; label: string; items: Capture[] }[] = [];
  const fmt = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  for (const c of items) {
    const key = c.createdAt.toISOString().slice(0, 10);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: fmt.format(c.createdAt), items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }
  return groups;
}

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

export default async function CapturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, deviceId] = await Promise.all([getCurrentUser(), deviceIdFromRequest()]);
  if (!user && !deviceId) redirect("/login?next=%2Fcaptures");
  const owner = user ? { userId: user.id } : { deviceId: deviceId! };

  const sp = await searchParams;
  let q = first(sp.q);
  let tag = first(sp.tag);
  const app = first(sp.app);
  const day = first(sp.day);
  // "#foo" in the search box means a tag filter.
  if (q?.startsWith("#") && q.length > 1) {
    tag = q.slice(1).toLowerCase();
    q = undefined;
  }
  const before = first(sp.before);
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
  const filters = { q, tag, app, day };
  const hasFilters = !!(q || tag || app || day);

  const rows = await listCaptures(owner, { ...filters, limit: PAGE + 1, before: beforeDate });
  const hasMore = rows.length > PAGE;
  const items = rows.slice(0, PAGE);
  const groups = groupByDay(items);
  const timeFmt = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });

  const withParams = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/captures${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <form action="/captures" className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              className="input pl-9"
              name="q"
              defaultValue={q ?? (tag ? `#${tag}` : "")}
              placeholder="Search all captures: text on the image, tags, app, page title…"
            />
          </div>
          {app ? <input type="hidden" name="app" value={app} /> : null}
          {day ? <input type="hidden" name="day" value={day} /> : null}
          <button className="btn">Search</button>
        </form>

        {hasFilters ? (
          <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="label">
              {items.length}
              {hasMore ? "+" : ""} result{items.length === 1 ? "" : "s"} for
            </span>
            {q ? <Chip label={`“${q}”`} href={withParams({ q: undefined })} /> : null}
            {tag ? <Chip label={`#${tag}`} href={withParams({ tag: undefined })} /> : null}
            {app ? <Chip label={`App: ${app}`} href={withParams({ app: undefined })} /> : null}
            {day ? <Chip label={`Day: ${day}`} href={withParams({ day: undefined })} /> : null}
            <Link href="/captures" className="text-muted underline">clear all</Link>
          </div>
        ) : null}


        {items.length === 0 && !beforeDate ? (
          hasFilters ? (
            <p className="py-16 text-center text-muted">Nothing matches these filters.</p>
          ) : (
            <div className="card mx-auto max-w-lg p-10 text-center space-y-3">
              <h1 className="text-xl font-semibold">No captures yet</h1>
              <p className="text-muted text-sm">
                Install the Mac app, then click its icon and select a part of your
                screen. It will show up here.
              </p>
              <Link href="/download" className="btn btn-primary">Get the Mac app</Link>
            </div>
          )
        ) : null}

        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="label mb-3 flex items-center gap-3">
                <span className="inline-block h-2 w-2 bg-accent" />
                <Link href={withParams({ day: g.key })} className="hover:text-foreground">{g.label}</Link>
                <span className="text-muted/70">{g.items.length}</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {g.items.map((c) => (
                  <div key={c.id} className="card group relative flex flex-col overflow-hidden transition-colors hover:border-accent/60">
                    <Corners size={10} inset={4} className="z-10 opacity-0 transition-opacity group-hover:opacity-100" />
                    <Link href={`/i/${c.id}`} className="aspect-[4/3] overflow-hidden bg-stage" title={c.title ?? undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl(c)}
                        alt={c.title ?? "Screenshot"}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    </Link>
                    <div className="flex items-center justify-between gap-2 px-2 pt-1.5 text-xs text-muted">
                      <Link href={`/i/${c.id}`} className="min-w-0 truncate text-foreground">
                        {c.title ?? timeFmt.format(c.createdAt)}
                      </Link>
                      <span className="flex shrink-0 items-center gap-1">
                        {c.accessPolicy === "only_me" ? <Icon name="lock" className="h-3 w-3" /> : null}
                        {c.width && c.height ? <span className="data text-[10.5px]">{c.width}×{c.height}</span> : null}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5 pt-1 font-mono text-[10.5px] text-muted">
                      {c.app ? (
                        <Link href={withParams({ app: c.app })} className="truncate hover:underline">{c.app}</Link>
                      ) : null}
                      {c.tags.slice(0, 3).map((t) => (
                        <Link key={t} href={withParams({ tag: t, q: undefined })} className="rounded bg-card-2 px-1 hover:text-accent">
                          #{t}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 flex justify-center gap-3">
          {beforeDate ? <Link href={withParams({})} className="btn">← Newest</Link> : null}
          {hasMore ? (
            <Link
              href={withParams({ before: items[items.length - 1].createdAt.toISOString() })}
              className="btn"
            >
              Older →
            </Link>
          ) : null}
        </div>
      </main>
    </>
  );
}

function Chip({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 hover:border-accent">
      {label}
      <Icon name="close" className="h-3 w-3 text-muted" />
    </Link>
  );
}
