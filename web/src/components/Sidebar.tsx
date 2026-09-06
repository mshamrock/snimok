"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "./Icon";

type Item = { href: string; label: string; icon: string; count?: number; active: boolean };

/** Library navigation: sections on top, saved filters below. Horizontal strip on phones. */
export function Sidebar({ total, gifs, privateCount }: { total: number; gifs: number; privateCount: number }) {
  const path = usePathname();
  const sp = useSearchParams();
  const onCaptures = path === "/captures";
  const type = sp.get("type");
  const access = sp.get("access");

  const sections: Item[] = [
    { href: "/captures", label: "Captures", icon: "image", count: total, active: onCaptures && !type && !access },
    { href: "/tags", label: "Tags", icon: "hash", active: path === "/tags" },
    { href: "/apps", label: "Apps", icon: "apps", active: path === "/apps" },
    { href: "/sites", label: "Sites", icon: "globe", active: path === "/sites" },
  ];
  const filters: Item[] = [
    { href: "/captures?type=gif", label: "GIFs", icon: "film", count: gifs, active: onCaptures && type === "gif" },
    { href: "/captures?access=only_me", label: "Only me", icon: "lock", count: privateCount, active: onCaptures && access === "only_me" },
  ];

  return (
    <nav aria-label="Library" className="md:sticky md:top-[72px] md:w-52 md:shrink-0 md:self-start">
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:px-0 md:pb-0">
        {sections.map((it) => <Row key={it.href} {...it} />)}
        <li aria-hidden className="hidden md:block md:py-2"><hr className="border-border" /></li>
        {filters.map((it) => <Row key={it.href} {...it} />)}
      </ul>
    </nav>
  );
}

function Row({ href, label, icon, count, active }: Item) {
  return (
    <li className="shrink-0">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
          active
            ? "border-border bg-card text-foreground"
            : "border-transparent text-muted hover:bg-card-2 hover:text-foreground"
        }`}
      >
        <Icon name={icon} className={`h-4 w-4 shrink-0 ${active ? "text-accent" : ""}`} />
        <span className="flex-1">{label}</span>
        {count !== undefined ? (
          <span className="data hidden text-[11px] text-muted md:inline">{new Intl.NumberFormat("en").format(count)}</span>
        ) : null}
      </Link>
    </li>
  );
}
