import "server-only";
import { and, gte, lt, min } from "drizzle-orm";
import { db, schema } from "@/db";
import { ownerWhere, siteOf, type CaptureOwner, type Facet } from "@/lib/captures";
import { dayKeyIn, zonedDayStart } from "@/lib/tz";

export type Recap = {
  year: number;
  tz: string;
  total: number;
  images: number;
  gifs: number;
  /** Captures touched after upload: annotated, cropped, retitled, tagged… */
  edited: number;
  privateCount: number;
  bytes: number;
  tagsUsed: number;
  topTags: Facet[];
  /** YYYY-MM-DD (in `tz`) → captures that day. */
  days: Record<string, number>;
  activeDays: number;
  busiestDay: { day: string; n: number } | null;
  longestStreak: { days: number; from: string; to: string } | null;
  /** Counts per month (0–11), weekday (0 = Sunday), hour (0–23), all in `tz`. */
  months: number[];
  weekdays: number[];
  hours: number[];
  appsTotal: number;
  topApps: Facet[];
  sitesTotal: number;
  topSites: Facet[];
};

const TOP = 5;

/** Calendar year (in `tz`) of the owner's oldest capture, or null when empty. */
export async function firstYear(owner: CaptureOwner, tz: string): Promise<number | null> {
  const [row] = await (await db())
    .select({ oldest: min(schema.captures.createdAt) })
    .from(schema.captures)
    .where(ownerWhere(owner));
  const oldest = row?.oldest;
  return oldest ? Number(dayKeyIn(new Date(oldest), tz).slice(0, 4)) : null;
}

function top(counts: Map<string, number>, n = TOP): Facet[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([name, count]) => ({ name, n: count }));
}

function bump(map: Map<string, number>, key: string | null | undefined) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

const DAY_MS = 86_400_000;
const utcOf = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));

/**
 * Everything the Recap page shows for one calendar year, computed in the
 * viewer's time zone. Aggregation happens in JS over a narrow projection of
 * the year's rows (a few thousand at most), which keeps one code path for
 * Neon and PGlite and avoids time-zone arithmetic in SQL.
 */
export async function recapFor(owner: CaptureOwner, year: number, tz: string): Promise<Recap> {
  const c = schema.captures;
  const start = zonedDayStart(`${year}-01-01`, tz)!;
  const end = zonedDayStart(`${year + 1}-01-01`, tz)!;
  const rows = await (await db())
    .select({
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      contentType: c.contentType,
      accessPolicy: c.accessPolicy,
      sizeBytes: c.sizeBytes,
      tags: c.tags,
      app: c.app,
      sourceUrl: c.sourceUrl,
    })
    .from(c)
    .where(and(ownerWhere(owner), gte(c.createdAt, start), lt(c.createdAt, end)));

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });

  const days: Record<string, number> = {};
  const months = new Array<number>(12).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  const hours = new Array<number>(24).fill(0);
  const tagCounts = new Map<string, number>();
  const appCounts = new Map<string, number>();
  const siteCounts = new Map<string, number>();
  let images = 0, gifs = 0, edited = 0, privateCount = 0, bytes = 0;

  for (const r of rows) {
    const p = fmt.formatToParts(r.createdAt).reduce<Record<string, string>>((acc, x) => ((acc[x.type] = x.value), acc), {});
    const day = `${p.year}-${p.month}-${p.day}`;
    days[day] = (days[day] ?? 0) + 1;
    months[+p.month - 1]++;
    weekdays[new Date(utcOf(day)).getUTCDay()]++;
    hours[+p.hour % 24]++;
    if (r.contentType === "image/gif") gifs++; else images++;
    if (r.updatedAt.getTime() - r.createdAt.getTime() > 60_000) edited++;
    if (r.accessPolicy === "only_me") privateCount++;
    bytes += r.sizeBytes ?? 0;
    for (const t of r.tags) if (t !== "gyazo") bump(tagCounts, t); // "gyazo" only marks imports
    bump(appCounts, r.app);
    bump(siteCounts, siteOf(r.sourceUrl));
  }

  const dayKeys = Object.keys(days).sort();
  let busiestDay: Recap["busiestDay"] = null;
  for (const d of dayKeys) if (!busiestDay || days[d] > busiestDay.n) busiestDay = { day: d, n: days[d] };

  let longestStreak: Recap["longestStreak"] = null;
  let runStart = 0;
  for (let i = 0; i <= dayKeys.length; i++) {
    const continues = i > 0 && i < dayKeys.length && utcOf(dayKeys[i]) - utcOf(dayKeys[i - 1]) === DAY_MS;
    if (i > 0 && !continues) {
      const len = i - runStart;
      if (!longestStreak || len > longestStreak.days) {
        longestStreak = { days: len, from: dayKeys[runStart], to: dayKeys[i - 1] };
      }
      runStart = i;
    }
  }

  return {
    year,
    tz,
    total: rows.length,
    images,
    gifs,
    edited,
    privateCount,
    bytes,
    tagsUsed: tagCounts.size,
    topTags: top(tagCounts),
    days,
    activeDays: dayKeys.length,
    busiestDay,
    longestStreak,
    months,
    weekdays,
    hours,
    appsTotal: appCounts.size,
    topApps: top(appCounts),
    sitesTotal: siteCounts.size,
    topSites: top(siteCounts),
  };
}

/** Index of the largest value, or null when everything is zero. */
export function argmax(values: number[]): number | null {
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v > 0 && (best === null || v > values[best])) best = i;
  });
  return best;
}
