import { USE_MOCK } from "@/lib/data";

/**
 * Registers the advisor service worker (public/advisor-sw.js), which keeps a copy of the advisor app so it opens
 * without signal. Scope /advisor: the operations and master pages are never controlled by it. Only in production
 * builds that use Firebase, so `next dev`, demo mode and the single-file preview are left alone.
 */
export function registerAdvisorServiceWorker() {
  if (USE_MOCK || process.env.NODE_ENV !== "production") return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const version = process.env.NEXT_PUBLIC_BUILD_ID || "1";
  navigator.serviceWorker.register(`/advisor-sw.js?v=${encodeURIComponent(version)}`, { scope: "/advisor" }).catch(() => {
    // Not available here (for example some private windows): the app still works online.
  });
}
