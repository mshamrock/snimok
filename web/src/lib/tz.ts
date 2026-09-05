import "server-only";
import { cookies } from "next/headers";

export const TZ_COOKIE = "tz";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Viewer's IANA time zone (set by the browser via a cookie), UTC until known. */
export async function getTimeZone(): Promise<string> {
  const v = (await cookies()).get(TZ_COOKIE)?.value;
  return v && v.length <= 64 && isValidTimeZone(v) ? v : "UTC";
}

/** YYYY-MM-DD of `date` in `tz`. */
export function dayKeyIn(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function offsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((acc, x) => ((acc[x.type] = x.value), acc), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60_000;
}

/** Instant at which the calendar day `YYYY-MM-DD` starts in `tz`. */
export function zonedDayStart(day: string, tz: string): Date | null {
  const guess = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(guess.getTime())) return null;
  let start = new Date(guess.getTime() - offsetMinutes(guess, tz) * 60_000);
  const second = offsetMinutes(start, tz);
  if (second !== offsetMinutes(guess, tz)) start = new Date(guess.getTime() - second * 60_000);
  return start;
}
