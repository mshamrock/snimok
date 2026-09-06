import Link from "next/link";
import { Corners } from "./Corners";
import { Icon } from "./Icon";
import { imageUrl } from "@/lib/captures";
import type { ViewMode } from "@/lib/view";
import type { Capture } from "@/db/schema";

type LinkFor = (extra: Record<string, string | undefined>) => string;

/** Grid classes per tile size. */
export const GRID: Record<Exclude<ViewMode, "list">, string> = {
  large: "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3",
  medium: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5",
  small: "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8",
};

function Badges({ c, overlay = false }: { c: Capture; overlay?: boolean }) {
  const gif = c.contentType === "image/gif";
  const locked = c.accessPolicy === "only_me";
  if (!gif && !locked) return null;
  return (
    <span className={overlay ? "absolute right-1.5 top-1.5 z-10 flex items-center gap-1" : "flex shrink-0 items-center gap-1"}>
      {gif ? <span className={`label rounded px-1 text-accent ${overlay ? "bg-background/80" : "bg-accent/20"}`}>GIF</span> : null}
      {locked ? (
        <span className={overlay ? "rounded bg-background/80 p-0.5 text-foreground" : "text-muted"}>
          <Icon name="lock" className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );
}

/** One capture as a tile; `view` picks the density. */
export function CaptureTile({
  c,
  view,
  time,
  linkFor,
}: {
  c: Capture;
  view: Exclude<ViewMode, "list">;
  time: string;
  linkFor: LinkFor;
}) {
  const href = `/i/${c.id}`;
  const aspect = view === "large" ? "aspect-video" : "aspect-[4/3]";
  return (
    <div className="card group relative flex flex-col overflow-hidden transition-colors hover:border-accent/60">
      <Corners size={10} inset={4} className="z-10 opacity-0 transition-opacity group-hover:opacity-100" />
      {view === "small" ? <Badges c={c} overlay /> : null}
      <Link href={href} className={`${aspect} overflow-hidden bg-stage`} title={c.title ?? time}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(c)} alt={c.title ?? "Screenshot"} loading="lazy" className="h-full w-full object-contain" />
      </Link>
      {view !== "small" ? (
        <>
          <div className={`flex items-center justify-between gap-2 px-2 pt-1.5 text-muted ${view === "large" ? "text-sm" : "text-xs"}`}>
            <Link href={href} className="min-w-0 truncate text-foreground">
              {c.title ?? time}
            </Link>
            <span className="flex shrink-0 items-center gap-1.5">
              <Badges c={c} />
              {c.title ? <span className="data text-[10.5px]">{time}</span> : null}
              {c.width && c.height ? <span className="data text-[10.5px]">{c.width}×{c.height}</span> : null}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5 pt-1 font-mono text-[10.5px] text-muted">
            {c.app ? (
              <Link href={linkFor({ app: c.app })} className="truncate hover:underline">{c.app}</Link>
            ) : null}
            {view === "large" && c.sourceTitle ? (
              <span className="min-w-0 truncate opacity-80">· {c.sourceTitle}</span>
            ) : null}
            {c.tags.slice(0, view === "large" ? 6 : 3).map((t) => (
              <Link key={t} href={linkFor({ tag: t, q: undefined })} className="rounded bg-card-2 px-1 hover:text-accent">
                #{t}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** One capture as a row in the list view. */
export function CaptureRow({ c, time, linkFor }: { c: Capture; time: string; linkFor: LinkFor }) {
  const href = `/i/${c.id}`;
  const secondary = [c.app, c.sourceTitle].filter(Boolean).join(" · ");
  return (
    <div className="group flex items-center gap-4 px-3 py-2 transition-colors hover:bg-card-2">
      <Link href={href} className="relative h-14 w-20 shrink-0 overflow-hidden rounded-sm bg-stage">
        <Corners size={8} inset={2} className="z-10 opacity-0 transition-opacity group-hover:opacity-100" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(c)} alt="" loading="lazy" className="h-full w-full object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-sm text-foreground">
          {c.title ?? `Screenshot ${time}`}
        </Link>
        {secondary ? (
          <div className="truncate font-mono text-[10.5px] text-muted">
            {c.app ? (
              <Link href={linkFor({ app: c.app })} className="hover:underline">{c.app}</Link>
            ) : null}
            {c.app && c.sourceTitle ? " · " : ""}
            {c.sourceTitle}
          </div>
        ) : null}
      </div>
      {c.tags.length ? (
        <div className="hidden max-w-[28%] flex-wrap justify-end gap-1 font-mono text-[10.5px] text-muted md:flex">
          {c.tags.slice(0, 4).map((t) => (
            <Link key={t} href={linkFor({ tag: t, q: undefined })} className="rounded bg-card-2 px-1 hover:text-accent">
              #{t}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="flex shrink-0 items-center gap-3 text-muted">
        <Badges c={c} />
        {c.width && c.height ? <span className="data hidden text-[11px] sm:inline">{c.width}×{c.height}</span> : null}
        <span className="data w-12 text-right text-[11px]">{time}</span>
      </div>
    </div>
  );
}
