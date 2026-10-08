import { firebaseApi } from "./firebase";
import { mockApi } from "./mock";
import type { DataApi } from "./types";

/**
 * Demo data is the default. Set NEXT_PUBLIC_USE_MOCK=false (plus the NEXT_PUBLIC_FIREBASE_* values) to use
 * Firebase: Google and email/password sign-in, and Firestore, with access enforced by firestore.rules.
 */
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

export const api: DataApi = USE_MOCK ? mockApi : firebaseApi;
export type * from "./types";
