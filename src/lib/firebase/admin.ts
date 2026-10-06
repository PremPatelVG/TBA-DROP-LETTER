import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Admin SDK for server actions. Credentials, in order:
 * - FIREBASE_SERVICE_ACCOUNT_KEY: a service account key as JSON (or base64 JSON), for hosts outside Google Cloud;
 * - otherwise Application Default Credentials: automatic on Firebase App Hosting and Cloud Run.
 * With FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST set it talks to the local emulators instead.
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || undefined;
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (key) {
    const json = JSON.parse(key.startsWith("{") ? key : Buffer.from(key, "base64").toString("utf8"));
    return initializeApp({ credential: cert(json), projectId: projectId ?? json.project_id });
  }
  return initializeApp(projectId ? { projectId } : undefined);
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
