// Replacement for next/navigation in the single-file demo. In the claude.ai artifact viewer (preview:build) routes
// live in memory, because the viewer frame only passes plain #anchors. On a normal static host (build:demo) they
// live in the URL hash (#/advisor), so the browser's back button, reload and shared links work.
import { useSyncExternalStore } from "react";

declare const __HASH_ROUTES__: boolean;
export const HASH_ROUTES = typeof __HASH_ROUTES__ !== "undefined" && __HASH_ROUTES__;

const fromHash = () => (window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : "/login");
let current = HASH_ROUTES ? fromHash() : "/login";
const listeners = new Set<() => void>();
const memoryHistory: string[] = [];
const changed = () => listeners.forEach((l) => l());

if (HASH_ROUTES) {
  // Back, forward, or a route typed into the address bar.
  const sync = () => {
    const next = fromHash();
    if (next !== current) {
      current = next;
      changed();
    }
  };
  window.addEventListener("popstate", sync);
  window.addEventListener("hashchange", sync);
}

export function navigate(href: string, replace = false) {
  if (HASH_ROUTES) window.history[replace ? "replaceState" : "pushState"](null, "", `#${href}`);
  else if (!replace) memoryHistory.push(current);
  current = href;
  changed();
  window.scrollTo(0, 0);
}
export function back() {
  if (HASH_ROUTES) return window.history.back();
  const prev = memoryHistory.pop();
  if (prev) navigate(prev, true);
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useLocation = () => useSyncExternalStore(subscribe, () => current);

export function useRouter() {
  return { push: (h: string) => navigate(h), replace: (h: string) => navigate(h, true), back, refresh: () => {}, prefetch: () => {} };
}
export function usePathname() {
  return useLocation().split("?")[0];
}
export function useSearchParams() {
  const q = useLocation().split("?")[1] ?? "";
  return new URLSearchParams(q);
}

let params: Record<string, string> = {};
export function setParams(p: Record<string, string>) { params = p; }
export function useParams<T extends Record<string, string>>() {
  useLocation();
  return params as T;
}
export function notFound(): never { throw new Error("Not found"); }
export function redirect(h: string): never { navigate(h, true); throw new Error("redirect"); }
