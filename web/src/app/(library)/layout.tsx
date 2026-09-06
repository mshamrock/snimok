import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { appCounts, libraryStats, topTags } from "@/lib/captures";
import { libraryOwner } from "@/lib/library";

/** Library pages (/captures, /tags, /apps, /sites): header with search suggestions + sidebar. */
export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const { owner } = await libraryOwner();
  const [stats, tags, apps] = await Promise.all([libraryStats(owner), topTags(owner, 20), appCounts(owner)]);
  const suggestions = [
    ...tags.map((t) => `#${t}`),
    ...apps.slice(0, 12).map((a) => `app:${a.name}`),
    "is:gif",
    "is:private",
  ];
  return (
    <>
      <Header suggestions={suggestions} />
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-8">
        <Suspense fallback={<div className="md:w-52 md:shrink-0" />}>
          <Sidebar total={stats.total} gifs={stats.gifs} privateCount={stats.privateCount} />
        </Suspense>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
