import Link from "next/link";
import { notFound } from "next/navigation";
import { Heatmap, HeatmapLegend } from "@/components/Heatmap";
import { Icon } from "@/components/Icon";
import { ownerName, type Facet } from "@/lib/captures";
import { libraryOwner } from "@/lib/library";
import { argmax, firstYear, recapFor } from "@/lib/recap";
import { dayKeyIn, getTimeZone } from "@/lib/tz";

type Props = { params: Promise<{ year: string }> };

export async function generateMetadata({ params }: Props) {
  const { year } = await params;
  return { title: `Recap ${year}` };
}

const nf = new Intl.NumberFormat("en");

function formatBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.ceil(n / 1024)} KB`;
}

export default async function RecapPage({ params }: Props) {
  const { year: yearParam } = await params;
  if (!/^\d{4}$/.test(yearParam)) notFound();
  const year = Number(yearParam);
  const tz = await getTimeZone();
  const thisYear = Number(dayKeyIn(new Date(), tz).slice(0, 4));
  if (year < 2000 || year > thisYear) notFound();

  const { owner, user } = await libraryOwner(`/recap/${year}`);
  const [r, oldest] = await Promise.all([recapFor(owner, year, tz), firstYear(owner, tz)]);
  const minYear = oldest ?? thisYear;

  const monthFmt = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" });
  const weekdayFmt = new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" });
  const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
  const topMonth = argmax(r.months);
  const topWeekday = argmax(r.weekdays);
  const topHour = argmax(r.hours);
  const name = user ? ownerName(user) : "This device";
  const dayHref = (day: string) => `/captures?day=${day}`;
  const dateOf = (day: string) => dateFmt.format(new Date(`${day}T12:00:00Z`));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <YearLink year={year - 1} enabled={year - 1 >= minYear} dir="prev" />
        <div className="text-center">
          <p className="label">Snimok recap</p>
          <h1 className="text-3xl font-semibold tracking-tight">{year}</h1>
          <div className="mt-3 flex items-center justify-center gap-2 text-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-accent font-mono text-xs uppercase text-accent">
              {name.slice(0, 1)}
            </span>
            <span>{name}</span>
          </div>
        </div>
        <YearLink year={year + 1} enabled={year + 1 <= thisYear} dir="next" />
      </div>

      <section className="card space-y-3 p-4">
        <Heatmap year={year} days={r.days} hrefFor={dayHref} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="label">
            {nf.format(r.total)} capture{r.total === 1 ? "" : "s"} on {nf.format(r.activeDays)} day{r.activeDays === 1 ? "" : "s"}
          </p>
          <HeatmapLegend />
        </div>
      </section>

      {r.total === 0 ? (
        <p className="py-8 text-center text-muted">Nothing captured in {year}.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Stat icon="image" label="Images" value={nf.format(r.images)} />
          <Stat icon="film" label="GIFs" value={nf.format(r.gifs)} />
          <Stat icon="edit" label="Edited" value={nf.format(r.edited)} sub="annotated, cropped, retitled or tagged after upload" />
          <Stat icon="drive" label="Storage" value={formatBytes(r.bytes)} />
          <Stat
            icon="calendar"
            label="Most active month"
            value={topMonth === null ? "—" : monthFmt.format(new Date(Date.UTC(year, topMonth, 15)))}
            sub={topMonth === null ? undefined : `${nf.format(r.months[topMonth])} captures`}
          />
          <Stat
            icon="chart"
            label="Most active day"
            value={topWeekday === null ? "—" : weekdayFmt.format(new Date(Date.UTC(2024, 0, 7 + topWeekday)))}
            sub={topWeekday === null ? undefined : `${nf.format(r.weekdays[topWeekday])} captures`}
          />
          <Stat
            icon="clock"
            label="Most active hour"
            value={topHour === null ? "—" : `${String(topHour).padStart(2, "0")}:00`}
            sub={topHour === null ? undefined : `${nf.format(r.hours[topHour])} captures · ${tz}`}
          />
          <Stat
            icon="flame"
            label="Longest streak"
            value={r.longestStreak ? `${r.longestStreak.days} day${r.longestStreak.days === 1 ? "" : "s"}` : "—"}
            sub={r.longestStreak ? `${dateOf(r.longestStreak.from)} – ${dateOf(r.longestStreak.to)}` : undefined}
          />
          <Stat
            icon="star"
            label="Busiest day"
            value={r.busiestDay ? dateOf(r.busiestDay.day) : "—"}
            sub={r.busiestDay ? `${nf.format(r.busiestDay.n)} captures` : undefined}
            href={r.busiestDay ? dayHref(r.busiestDay.day) : undefined}
          />
          <Stat icon="lock" label="Only me" value={nf.format(r.privateCount)} />
          <Stat icon="hash" label="Tags used" value={nf.format(r.tagsUsed)} />
          <Ranked icon="hash" label="Most used tags" items={r.topTags} prefix="#" hrefFor={(t) => `/captures?tag=${encodeURIComponent(t)}`} />
          <Stat icon="apps" label="Apps captured" value={nf.format(r.appsTotal)} />
          <Ranked icon="apps" label="Most captured apps" items={r.topApps} hrefFor={(a) => `/captures?app=${encodeURIComponent(a)}`} />
          <Stat icon="globe" label="Sites captured" value={nf.format(r.sitesTotal)} />
          <Ranked icon="globe" label="Most captured sites" items={r.topSites} hrefFor={(s) => `/captures?site=${encodeURIComponent(s)}`} />
        </div>
      )}
    </div>
  );
}

function YearLink({ year, enabled, dir }: { year: number; enabled: boolean; dir: "prev" | "next" }) {
  const inner = (
    <>
      {dir === "prev" ? <Icon name="left" className="h-4 w-4" /> : null}
      <span className="data">{year}</span>
      {dir === "next" ? <Icon name="right" className="h-4 w-4" /> : null}
    </>
  );
  return enabled ? (
    <Link href={`/recap/${year}`} className="btn border-transparent bg-transparent text-muted hover:text-foreground">
      {inner}
    </Link>
  ) : (
    <span aria-hidden className="btn invisible">{inner}</span>
  );
}

function Stat({ icon, label, value, sub, href }: { icon: string; label: string; value: string; sub?: string; href?: string }) {
  const val = <span className="text-3xl font-semibold tabular-nums tracking-tight text-accent">{value}</span>;
  return (
    <div className="card flex items-center justify-between gap-4 px-5 py-5">
      <div className="flex items-center gap-3 text-sm">
        <Icon name={icon} className="h-4 w-4 text-muted" />
        <span>{label}</span>
      </div>
      <div className="text-right">
        {href ? <Link href={href} className="hover:underline">{val}</Link> : val}
        {sub ? <p className="label mt-1 normal-case tracking-normal">{sub}</p> : null}
      </div>
    </div>
  );
}

function Ranked({
  icon,
  label,
  items,
  prefix = "",
  hrefFor,
}: {
  icon: string;
  label: string;
  items: Facet[];
  prefix?: string;
  hrefFor: (name: string) => string;
}) {
  return (
    <div className="card flex items-start justify-between gap-4 px-5 py-5">
      <div className="flex items-center gap-3 text-sm">
        <Icon name={icon} className="h-4 w-4 text-muted" />
        <span>{label}</span>
      </div>
      {items.length === 0 ? (
        <span className="text-muted">—</span>
      ) : (
        <ol className="space-y-1 text-right">
          {items.map((f, i) => (
            <li key={f.name} className="flex items-baseline justify-end gap-2">
              <span className="label">#{i + 1}</span>
              <Link href={hrefFor(f.name)} className="max-w-[16rem] truncate text-accent hover:underline">
                {prefix}
                {f.name}
              </Link>
              <span className="data text-muted">{nf.format(f.n)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
