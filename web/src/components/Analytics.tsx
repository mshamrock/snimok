"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { CONSENT_KEY, sanitizePage, sanitizeReferrer } from "@/lib/analytics";

/**
 * Google Analytics 4 via gtag.js. Rendered only when NEXT_PUBLIC_GA_ID is
 * set (production). Automatic page views are off; each route change sends one
 * page view with the sanitised path and title (see lib/analytics).
 */
export function Analytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    // Wait a tick so the new page's <title> is in place.
    const t = setTimeout(() => {
      const page = sanitizePage(pathname, document.title);
      window.gtag?.("event", "page_view", {
        page_path: page.path,
        page_location: `${location.origin}${page.path}`,
        page_title: page.title,
        page_referrer: sanitizeReferrer(document.referrer, location.origin),
      });
    }, 0);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <>
      <Script id="ga-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
var c = null; try { c = localStorage.getItem(${JSON.stringify(CONSENT_KEY)}); } catch (e) {}
gtag('consent', 'default', {
  analytics_storage: c === 'granted' ? 'granted' : 'denied',
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
});
gtag('js', new Date());
gtag('config', ${JSON.stringify(gaId)}, { send_page_view: false, allow_google_signals: false });
`}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} strategy="afterInteractive" />
    </>
  );
}
