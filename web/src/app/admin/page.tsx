import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { anonymousStats, isAdmin, SORTS, userStats, type Sort, type UserStats } from "@/lib/admin";
import { getTimeZone } from "@/lib/tz";

// Non-admins must not learn the page exists, not even from the tab title.
export async function generateMetadata() {
  const admin = isAdmin(await getCurrentUser());
  return { title: admin ? "Admin" : "Not found", robots: { index: false, follow: false } };
}

const nf = new Intl.NumberFormat("en");

function formatBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n > 0) return `${Math.ceil(n / 1024)} KB`;
  return "0";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/admin");
  // Not an admin: behave as if the page did not exist.
  if (!isAdmin(user)) notFound();

  const sp = await searchParams;
  const raw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort: Sort = (SORTS as readonly string[]).includes(raw ?? "") ? (raw as Sort) : "captures";
  const [rows, anon, tz] = await Promise.all([userStats(sort), anonymousStats(), getTimeZone()]);

  const dateFmt = new Intl.DateTimeFormat("en", { timeZone: tz, dateStyle: "medium" });
  const sum = (k: keyof Pick<UserStats, "captures" | "images" | "gifs" | "bytes" | "imported">) =>
    rows.reduce((s, r) => s + r[k], 0);
  const totals = { captures: sum("captures"), images: sum("images"), gifs: sum("gifs"), bytes: sum("bytes"), imported: sum("imported") };
  const active = rows.filter((r) => r.captures > 0).length;

  const th = (key: Sort, label: string, align: "left" | "right" = "right") => (
    <th className={`px-3 py-2 font-normal ${align === "right" ? "text-right" : "text-left"}`}>
      <Link
        href={`/admin?sort=${key}`}
        className={`label hover:text-foreground ${sort === key ? "text-accent" : ""}`}
        aria-current={sort === key ? "true" : undefined}
      >
        {label}
        {sort === key ? " ↓" : ""}
      </Link>
    </th>
  );

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-6 px-4 py-6">
        <div>
          <h1 className="text-lg font-semibold">Users</h1>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat
            label="Accounts"
            value={nf.format(rows.length)}
            sub={`${nf.format(active)} with captures · ${nf.format(rows.length - active)} without`}
          />
          <Stat label="Captures" value={nf.format(totals.captures + anon.captures)} sub={`${nf.format(totals.imported)} imported from Gyazo`} />
          <Stat label="Images" value={nf.format(totals.images + anon.captures - anon.gifs)} />
          <Stat label="GIFs" value={nf.format(totals.gifs + anon.gifs)} />
          <Stat label="Storage" value={formatBytes(totals.bytes + anon.bytes)} />
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border">
              <tr>
                {th("email", "User", "left")}
                {th("captures", "Captures")}
                {th("images", "Images")}
                {th("gifs", "GIFs")}
                {th("bytes", "Storage")}
                {th("last", "Last capture")}
                {th("joined", "Joined")}
                <th className="px-3 py-2 text-right font-normal"><span className="label">Macs</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-card-2">
                  <td className="px-3 py-2">
                    <div className="truncate">{r.email}</div>
                    {(() => {
                      const notes = [
                        r.displayName,
                        r.imported ? `${nf.format(r.imported)} from Gyazo` : null,
                        r.watermark ? "watermark on" : null,
                      ].filter(Boolean);
                      return notes.length ? (
                        <div className="label normal-case tracking-normal">{notes.join(" · ")}</div>
                      ) : null;
                    })()}
                  </td>
                  <td className="data px-3 py-2 text-right">{nf.format(r.captures)}</td>
                  <td className="data px-3 py-2 text-right">{nf.format(r.images)}</td>
                  <td className="data px-3 py-2 text-right">{r.gifs ? nf.format(r.gifs) : <span className="text-muted">0</span>}</td>
                  <td className="data px-3 py-2 text-right">{formatBytes(r.bytes)}</td>
                  <td className="data px-3 py-2 text-right">{r.lastCapture ? dateFmt.format(r.lastCapture) : <span className="text-muted">—</span>}</td>
                  <td className="data px-3 py-2 text-right">{dateFmt.format(r.createdAt)}</td>
                  <td className="data px-3 py-2 text-right">{r.devices || <span className="text-muted">0</span>}</td>
                </tr>
              ))}
              {anon.captures > 0 ? (
                <tr className="text-muted">
                  <td className="px-3 py-2">
                    <div>No account</div>
                    <div className="label normal-case tracking-normal">
                      {nf.format(anon.devices)} Mac{anon.devices === 1 ? "" : "s"} nobody has signed in from
                    </div>
                  </td>
                  <td className="data px-3 py-2 text-right">{nf.format(anon.captures)}</td>
                  <td className="data px-3 py-2 text-right">{nf.format(anon.captures - anon.gifs)}</td>
                  <td className="data px-3 py-2 text-right">{nf.format(anon.gifs)}</td>
                  <td className="data px-3 py-2 text-right">{formatBytes(anon.bytes)}</td>
                  <td colSpan={3} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="label">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-accent">{value}</p>
      {sub ? <p className="label mt-0.5 normal-case tracking-normal">{sub}</p> : null}
    </div>
  );
}
