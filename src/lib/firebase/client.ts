import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from "firebase/firestore";

// Browser-side Firebase. Values come from NEXT_PUBLIC_FIREBASE_* (see .env.example); on Firebase App Hosting
// next.config.ts fills them from the linked web app when they are not set.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};
const USE_EMULATORS = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true";
const EMULATOR_HOST = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function firebaseApp() {
  if (typeof window === "undefined") throw new Error("The Firebase client only runs in the browser.");
  if (!config.apiKey || !config.projectId) {
    throw new Error("Firebase is not configured. Set the NEXT_PUBLIC_FIREBASE_* values (see .env.example), or NEXT_PUBLIC_USE_MOCK=true for demo data.");
  }
  return (app ??= getApps()[0] ?? initializeApp(config));
}

export function clientAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(firebaseApp());
  if (USE_EMULATORS) connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  return auth;
}

/**
 * Firestore with offline persistence: reads come from the device when there is no signal, and entries
 * saved offline wait on the device (IndexedDB) and sync on their own when the connection is back.
 */
export function clientDb(): Firestore {
  if (db) return db;
  db = initializeFirestore(firebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (USE_EMULATORS) connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  return db;
}

/** On sign-out: drop this device's copy of the data so the next person on a shared phone starts clean. */
export async function clearLocalData() {
  if (!db) return;
  const current = db;
  db = null;
  await terminate(current);
  // Fails while the app is open in another tab; the next sign-in there still only sees what the rules allow.
  await clearIndexedDbPersistence(current).catch(() => {});
}
