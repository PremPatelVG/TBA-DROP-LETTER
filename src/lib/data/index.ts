import { firebaseApi } from "./firebase";
import type { DataApi } from "./types";

/**
 * Demo data is the default. Set NEXT_PUBLIC_USE_MOCK=false (plus the NEXT_PUBLIC_FIREBASE_* values) to use
 * Firebase: Google and email/password sign-in, and Firestore, with access enforced by firestore.rules.
 */
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

function lazyApi(load: () => Promise<DataApi>): DataApi {
  let ready: Promise<DataApi> | null = null;
  const get = () => (ready ??= load());
  return new Proxy({} as DataApi, {
    get(_, key) {
      if (key === "mode") return "mock";
      if (typeof key !== "string" || key === "then") return undefined;
      if (key === "subscribeSyncErrors") {
        return (onError: (message: string) => void) => {
          let stop: (() => void) | null = null;
          let cancelled = false;
          void get().then((a) => { if (!cancelled) stop = a.subscribeSyncErrors(onError); });
          return () => { cancelled = true; stop?.(); };
        };
      }
      return (...args: unknown[]) => get().then((a) => Reflect.apply(a[key as keyof DataApi] as (...x: unknown[]) => unknown, a, args));
    },
  });
}

// The demo data layer (mock.ts + its seed) is loaded on first use, through a dynamic import. The condition is
// written out (not via USE_MOCK) so the bundler can evaluate it at build time and drop the
// dynamic import entirely in a Firebase build: the demo seed and its shared demo password never ship there.
export const api: DataApi = process.env.NEXT_PUBLIC_USE_MOCK !== "false"
  ? lazyApi(() => import("./mock").then((m) => m.mockApi))
  : firebaseApi;
export type * from "./types";
