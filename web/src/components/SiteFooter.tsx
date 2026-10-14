import Link from "next/link";
import { Logo } from "./Logo";

/** Footer for the public pages: internal links that crawlers and people can follow. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted">
        <div className="flex items-center gap-2">
          <Logo className="h-5 w-5" />
          <span>Snimok · free screenshot tool for Mac</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/download" className="hover:text-foreground">Download for Mac</Link>
          <Link href="/gyazo-alternative" className="hover:text-foreground">Gyazo alternative</Link>
          <Link href="/register" className="hover:text-foreground">Create account</Link>
          <a href="https://github.com/mshamrock/snimok" className="hover:text-foreground" rel="noopener">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
