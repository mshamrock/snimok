import Link from "next/link";
import { cookies } from "next/headers";
import { Icon } from "@/components/Icon";
import { CaptureRow, CaptureTile, GRID } from "@/components/CaptureCards";
import { UploadButton } from "@/components/UploadButton";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { countCaptures, listCaptures, type ListFilters } from "@/lib/captures";
import { libraryOwner } from "@/lib/library";
import { dayKeyIn, getTimeZone } from "@/lib/tz";
import { PAGE_SIZE, VIEW_COOKIE, viewMode } from "@/lib/view";
import type { Capture } from "@/db/schema";

export const metadata = { title: "Captures" };

function groupByDay(items: Capture[], tz: string) {
  const groups: { key: string; label: string; items: Capture[] }[] = [];
  const fmt = new Intl.DateTimeFormat("en", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  for (const c of items) {
    const key = dayKeyIn(c.createdAt, tz);
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

/**
 * The search box understands a few prefixes, Gyazo-style:
 *   #design → tag, app:Safari → app, site:github.com → site,
 *   is:gif / is:private → type / access. Anything else is free text.
 */
function parseQuery(q: string | undefined, f: ListFilters): ListFilters {
  if (!q) return f;
  const m = /^(#|app:|site:|is:)\s*(.+)$/i.exec(q);
  if (!m) return { ...f, q };
  const value = m[2].trim();
  switch (m[1].toLowerCase()) {
    case "#":
      return { ...f, tag: value.toLowerCase() };
    case "app:":
      return { ...f, app: value };
    case "site:":
      return { ...f, site: value.toLowerCase().replace(/^www\./, "") };
    default: {
      const v = value.toLowerCase();
      if (v === "gif" || v === "animated") return { ...f, type: "gif" };
      if (v === "image" || v === "still") return { ...f, type: "image" };
      if (v === "private" || v === "only_me" || v === "only-me") return { ...f, access: "only_me" };
      return { ...f, q };
    }
  }
}

export default async function CapturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ owner }, tz, jar, sp] = await Promise.all([libraryOwner(), getTimeZone(), cookies(), searchParams]);
  const view = viewMode(jar.get(VIEW_COOKIE)?.value);

  const typeParam = first(sp.type);
  const base: ListFilters = {
    tag: first(sp.tag)?.toLowerCase(),
    app: first(sp.app),
    site: first(sp.site)?.toLowerCase(),
    type: typeParam === "gif" || typeParam === "image" ? typeParam : undefined,
    access: first(sp.access) === "only_me" ? "only_me" : undefined,
    day: first(sp.day),
    tz,
  };
  const filters = parseQuery(first(sp.q), base);
  const { q, tag, app, site, type, access, day } = filters;
  const hasFilters = !!(q || tag || app || site || type || access || day);

  const before = first(sp.before);
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
  const pageSize = PAGE_SIZE[view];

  const [rows, total] = await Promise.all([
    listCaptures(owner, { ...filters, limit: pageSize + 1, before: beforeDate }),
    countCaptures(owner, filters),
  ]);
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const groups = groupByDay(items, tz);
  const timeFmt = new Intl.DateTimeFormat("en", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const nf = new Intl.NumberFormat("en");

  const withParams = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all: Record<string, string | undefined> = { q, tag, app, site, type, access, day, ...extra };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return `/captures${s ? `?${s}` : ""}`;
  };

  const heading = q
    ? `Results for “${q}”`
    : tag
      ? `#${tag}`
      : app
        ? app
        : site
          ? site
          : type === "gif"
            ? "GIFs"
            : type === "image"
              ? "Still images"
              : access === "only_me"
                ? "Only me"
                : day
                  ? new Intl.DateTimeFormat("en", { timeZone: tz, dateStyle: "long" }).format(new Date(`${day}T12:00:00Z`))
                  : "Captures";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{heading}</h1>
          <p className="label">
            {nf.format(total)} capture{total === 1 ? "" : "s"}
            {beforeDate ? ` · older than ${timeFmt.format(beforeDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UploadButton />
          <ViewSwitcher value={view} />
        </div>
      </div>

      <form action="/captures" className="mb-4 flex gap-2 md:hidden">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            className="input pl-9"
            name="q"
            defaultValue={q ?? (tag ? `#${tag}` : app ? `app:${app}` : site ? `site:${site}` : "")}
            placeholder="Search: text on the image, #tag, app:, site:"
          />
        </div>
        <button className="btn">Search</button>
      </form>

      {hasFilters ? (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          {q ? <Chip label={`“${q}”`} href={withParams({ q: undefined })} /> : null}
          {tag ? <Chip label={`#${tag}`} href={withParams({ tag: undefined })} /> : null}
          {app ? <Chip label={`App: ${app}`} href={withParams({ app: undefined })} /> : null}
          {site ? <Chip label={`Site: ${site}`} href={withParams({ site: undefined })} /> : null}
          {type ? <Chip label={type === "gif" ? "GIFs" : "Still images"} href={withParams({ type: undefined })} /> : null}
          {access ? <Chip label="Only me" href={withParams({ access: undefined })} /> : null}
          {day ? <Chip label={`Day: ${day}`} href={withParams({ day: undefined })} /> : null}
          <Link href="/captures" className="text-muted underline">clear all</Link>
        </div>
      ) : null}

      {items.length === 0 && !beforeDate ? (
        hasFilters ? (
          <p className="py-16 text-center text-muted">Nothing matches these filters.</p>
        ) : (
          <div className="card mx-auto max-w-lg space-y-3 p-10 text-center">
            <h2 className="text-xl font-semibold">No captures yet</h2>
            <p className="text-sm text-muted">
              Install the Mac app, then click its icon and select a part of your
              screen. It will show up here. You can also upload an image with the button above.
            </p>
            <Link href="/download" className="btn btn-primary">Get the Mac app</Link>
          </div>
        )
      ) : null}

      <div className={view === "list" ? "space-y-8" : "space-y-10"}>
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="label mb-3 flex items-center gap-3">
              <span className="inline-block h-2 w-2 bg-accent" />
              <Link href={withParams({ day: g.key })} className="hover:text-foreground">{g.label}</Link>
              <span className="text-muted/70">{g.items.length}</span>
            </h2>
            {view === "list" ? (
              <div className="card divide-y divide-border overflow-hidden">
                {g.items.map((c) => (
                  <CaptureRow key={c.id} c={c} time={timeFmt.format(c.createdAt)} linkFor={withParams} />
                ))}
              </div>
            ) : (
              <div className={GRID[view]}>
                {g.items.map((c) => (
                  <CaptureTile key={c.id} c={c} view={view} time={timeFmt.format(c.createdAt)} linkFor={withParams} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {beforeDate || hasMore ? (
        <div className="mt-10 flex justify-center gap-3">
          {beforeDate ? <Link href={withParams({})} className="btn">← Newest</Link> : null}
          {hasMore ? (
            <Link href={withParams({ before: items[items.length - 1].createdAt.toISOString() })} className="btn">
              Older →
            </Link>
          ) : null}
        </div>
      ) : null}
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
