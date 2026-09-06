import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { deviceIdFromRequest } from "@/lib/captures";
import { logout } from "@/app/(auth)/actions";
import { Logo } from "./Logo";
import { Icon } from "./Icon";

/**
 * Site header. `suggestions` (tags as "#x", apps as "app:X", "is:gif"…) feed a
 * native datalist under the search box on library pages.
 */
export async function Header({ suggestions }: { suggestions?: string[] } = {}) {
  const [user, deviceId] = await Promise.all([
    getCurrentUser(),
    deviceIdFromRequest(),
  ]);
  const listId = suggestions?.length ? "snimok-suggest" : undefined;
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4">
        <Link href={user ? "/captures" : "/"} className="flex shrink-0 items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="font-semibold tracking-tight">Snimok</span>
        </Link>
        {user || deviceId ? (
          <form action="/captures" className="relative hidden max-w-md flex-1 md:block">
            <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              className="input py-1.5 pl-9"
              name="q"
              list={listId}
              autoComplete="off"
              placeholder="Search all captures"
              aria-label="Search all captures"
            />
            {listId ? (
              <datalist id={listId}>
                {suggestions!.map((s) => <option key={s} value={s} />)}
              </datalist>
            ) : null}
          </form>
        ) : null}
        <nav className="flex shrink-0 items-center gap-1 text-sm">
          {user ? (
            <>
              <Link href="/captures" className="btn border-transparent bg-transparent">
                Captures
              </Link>
              <Link href="/download" className="btn border-transparent bg-transparent">
                Download app
              </Link>
              <Link href="/settings" className="btn border-transparent bg-transparent">
                Settings
              </Link>
              <form action={logout}>
                <button className="btn border-transparent bg-transparent text-muted">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              {deviceId ? (
                <Link href="/captures" className="btn border-transparent bg-transparent">
                  Captures
                </Link>
              ) : null}
              <Link href="/login" className="btn border-transparent bg-transparent">
                Log in
              </Link>
              <Link href="/register" className="btn btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
