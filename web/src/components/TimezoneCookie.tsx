"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Tells the server the viewer's time zone so days in the timeline are local days. */
export function TimezoneCookie() {
  const router = useRouter();
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const current = document.cookie.split("; ").find((c) => c.startsWith("tz="))?.slice(3);
      if (decodeURIComponent(current ?? "") !== tz) {
        document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }
    } catch {
      /* ignore */
    }
  }, [router]);
  return null;
}
