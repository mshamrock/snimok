/**
 * Year heatmap, GitHub-style: one column per week (Monday first), one row per
 * weekday, amber intensity by captures per day. Every cell links to that day
 * in the timeline. Pure SVG so it scales and needs no client JS.
 */
const CELL = 12;
const GAP = 2;
const STEP = CELL + GAP;
const LEFT = 30; // weekday labels
const TOP = 18; // month labels

export const LEVELS: { min: number; label: string; className: string }[] = [
  { min: 0, label: "0", className: "fill-border" },
  { min: 1, label: "1–2", className: "fill-accent/30" },
  { min: 3, label: "3–4", className: "fill-accent/55" },
  { min: 5, label: "5–6", className: "fill-accent/80" },
  { min: 7, label: "7+", className: "fill-accent" },
];

export function levelFor(n: number) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) if (n >= l.min) lvl = l;
  return lvl;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function Heatmap({
  year,
  days,
  hrefFor,
}: {
  year: number;
  days: Record<string, number>;
  hrefFor: (day: string) => string;
}) {
  const jan1 = Date.UTC(year, 0, 1);
  const dec31 = Date.UTC(year, 11, 31);
  // Column 0 starts on the Monday on or before Jan 1.
  const mondayOffset = (new Date(jan1).getUTCDay() + 6) % 7;
  const totalDays = Math.round((dec31 - jan1) / 86_400_000) + 1;
  const weeks = Math.ceil((mondayOffset + totalDays) / 7);
  const width = LEFT + weeks * STEP;
  const height = TOP + 7 * STEP;
  const monthFmt = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
  const dayFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

  const cells: React.ReactNode[] = [];
  const monthLabels: React.ReactNode[] = [];
  for (let i = 0; i < totalDays; i++) {
    const t = jan1 + i * 86_400_000;
    const d = new Date(t);
    const key = `${year}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const n = days[key] ?? 0;
    const col = Math.floor((mondayOffset + i) / 7);
    const row = (d.getUTCDay() + 6) % 7;
    const x = LEFT + col * STEP;
    const y = TOP + row * STEP;
    if (d.getUTCDate() === 1) {
      monthLabels.push(
        <text key={`m${key}`} x={x} y={TOP - 7} className="fill-muted font-mono text-[9.5px] uppercase tracking-[0.08em]">
          {monthFmt.format(d)}
        </text>,
      );
    }
    const title = `${dayFmt.format(d)} · ${n} capture${n === 1 ? "" : "s"}`;
    const rect = <rect x={x} y={y} width={CELL} height={CELL} rx={2} className={levelFor(n).className} />;
    cells.push(
      n > 0 ? (
        <a key={key} href={hrefFor(key)} aria-label={title}>
          <title>{title}</title>
          {rect}
        </a>
      ) : (
        <g key={key}>
          <title>{title}</title>
          {rect}
        </g>
      ),
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full min-w-[640px]"
        role="img"
        aria-label={`Captures per day in ${year}`}
      >
        {monthLabels}
        {["Mon", "Wed", "Fri"].map((w, i) => (
          <text key={w} x={0} y={TOP + i * 2 * STEP + CELL - 2} className="fill-muted font-mono text-[9.5px]">
            {w}
          </text>
        ))}
        {cells}
      </svg>
    </div>
  );
}

export function HeatmapLegend() {
  return (
    <div className="label flex items-center justify-end gap-3">
      {LEVELS.map((l) => (
        <span key={l.label} className="flex items-center gap-1">
          <svg width={10} height={10} aria-hidden>
            <rect width={10} height={10} rx={2} className={l.className} />
          </svg>
          {l.label}
        </span>
      ))}
    </div>
  );
}
