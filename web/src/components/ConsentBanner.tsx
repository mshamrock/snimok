"use client";

import { useSyncExternalStore } from "react";
import { setConsent, storedConsent } from "@/lib/analytics";

function subscribe(cb: () => void) {
  window.addEventListener("snimok:consent", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("snimok:consent", cb);
    window.removeEventListener("storage", cb);
  };
}

/** Small corner card asking once for analytics cookies; hidden after a choice. */
export function ConsentBanner() {
  const choice = useSyncExternalStore(subscribe, storedConsent, () => "pending" as const);
  if (choice !== null) return null;
  return (
    <div
      role="dialog"
      aria-label="Analytics cookies"
      className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-4 text-sm shadow-lg"
    >
      <p className="label mb-1">Analytics</p>
      <p className="text-muted">
        We count visits with Google Analytics to see what to improve. Links to your captures and your searches are
        never sent. Allow analytics cookies?
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn" onClick={() => setConsent("denied")}>
          Decline
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setConsent("granted")}>
          Allow
        </button>
      </div>
    </div>
  );
}
