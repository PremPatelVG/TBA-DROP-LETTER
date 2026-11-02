import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Admin SDK for server actions. Credentials, in order:
 * - FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY: the two fields of a service account key, for Netlify (the live
 *   host; its functions get at most 4 KB of environment variables, so the whole key file does not fit comfortably);
 * - FIREBASE_SERVICE_ACCOUNT_KEY: a whole service account key as JSON (or base64 JSON), for other hosts;
 * - otherwise Application Default Credentials: automatic on Google Cloud (Cloud Run, App Hosting).
 * With FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST set it talks to the local emulators instead.
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || undefined;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (clientEmail && privateKey) {
    if (!projectId) throw new Error("Set NEXT_PUBLIC_FIREBASE_PROJECT_ID (or FIREBASE_PROJECT_ID) with FIREBASE_CLIENT_EMAIL.");
    // Pasted into a host's settings the key's line breaks often arrive as the two characters "\n", and sometimes
    // with the surrounding quotes from the JSON file.
    const pem = privateKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey: pem }), projectId });
  }
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (key) {
    const json = JSON.parse(key.startsWith("{") ? key : Buffer.from(key, "base64").toString("utf8"));
    return initializeApp({ credential: cert(json), projectId: projectId ?? json.project_id });
  }
  return initializeApp(projectId ? { projectId } : undefined);
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
