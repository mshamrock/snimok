import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { deviceIdFromRequest } from "@/lib/captures";
import { logout } from "@/app/(auth)/actions";
import { Logo } from "./Logo";
import { Icon } from "./Icon";

export async function Header() {
  const [user, deviceId] = await Promise.all([
    getCurrentUser(),
    deviceIdFromRequest(),
  ]);
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href={user ? "/captures" : "/"} className="flex shrink-0 items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="font-semibold tracking-tight">Snimok</span>
        </Link>
        {user || deviceId ? (
          <form action="/captures" className="relative hidden max-w-md flex-1 md:block">
            <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input className="input py-1.5 pl-9" name="q" placeholder="Search all captures" />
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
