/**
 * Google Analytics 4 helpers shared by the tag and the consent banner.
 *
 * Privacy rules for Snimok:
 *  - Only the pathname is reported, never the query (search terms, filters).
 *  - Capture pages are reported as "/i/:id" titled "Capture", so links to
 *    captures (including "Only me" ones) and their titles never reach Google.
 *  - Consent Mode v2: analytics cookies stay off until the visitor accepts.
 */
export const CONSENT_KEY = "snimok_analytics_consent";
export type Consent = "granted" | "denied";

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export function storedConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(v: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  window.gtag?.("consent", "update", { analytics_storage: v });
  window.dispatchEvent(new Event("snimok:consent"));
}

/** What GA is allowed to see for a route. */
export function sanitizePage(pathname: string, title: string): { path: string; title: string } {
  if (/^\/i\/[^/]+/.test(pathname)) {
    return { path: pathname.replace(/^\/i\/[^/]+/, "/i/:id"), title: "Capture" };
  }
  return { path: pathname, title };
}

/** The referrer GA may see: our own pages get the same treatment as page paths; other sites keep their origin only. */
export function sanitizeReferrer(referrer: string, origin: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const u = new URL(referrer);
    if (u.origin === origin) return `${origin}${sanitizePage(u.pathname, "").path}`;
    return u.origin;
  } catch {
    return undefined;
  }
}
