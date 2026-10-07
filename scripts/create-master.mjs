#!/usr/bin/env node
// Creates the first master account. Safe to run again.
//
//   npm run create-master -- --email you@gmail.com --name "Your Name"
//
// Credentials (the first that applies):
//   the local emulators, when FIRESTORE_EMULATOR_HOST is set (project demo-tba);
//   --key path/to/key.json, or a file named service-account.json in this folder
//     (Firebase console > Project settings > Service accounts > Generate new private key; delete it afterwards);
//   GOOGLE_APPLICATION_CREDENTIALS, if set;
//   the Google account you signed in with through `npx firebase login` (reused the same way the Firebase
//     emulators reuse it), so normally no key file is needed;
//   Application Default Credentials (`gcloud auth application-default login`, or Google Cloud Shell).
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function fail(message) {
  console.error(`\nCould not create the master account: ${message}\n`);
  process.exit(1);
}

/** Uses the account from `npx firebase login` as Application Default Credentials. Returns its email, or null. */
async function firebaseLoginCredentials() {
  try {
    const require = createRequire(import.meta.url);
    const { getProjectDefaultAccount } = require("firebase-tools/lib/auth");
    const { getCredentialPathAsync } = require("firebase-tools/lib/defaultCredentials");
    const account = getProjectDefaultAccount(process.cwd());
    const path = account ? await getCredentialPathAsync(account) : undefined;
    if (!path) return null;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
    return account.user?.email || "your Firebase login";
  } catch {
    return null;
  }
}

const { values: args } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" }, key: { type: "string" }, project: { type: "string" } },
});
const email = (args.email ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  fail('give the Google account email, for example:\n  npm run create-master -- --email you@gmail.com --name "Your Name"');
}
const name = (args.name ?? "").trim() || email.split("@")[0];

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const keyPath = args.key ?? (existsSync("service-account.json") ? "service-account.json" : null);
let key = null;
if (!emulator && keyPath) {
  try {
    key = JSON.parse(readFileSync(keyPath, "utf8"));
  } catch (e) {
    fail(`cannot read the key file ${keyPath} (${e.message}).`);
  }
}
const firebaserc = (() => {
  try { return JSON.parse(readFileSync(".firebaserc", "utf8")).projects?.default; } catch { return undefined; }
})();
const projectId = args.project ?? (emulator ? process.env.GCLOUD_PROJECT || "demo-tba" : key?.project_id ?? firebaserc);
if (!projectId || projectId === "your-firebase-project-id") fail("which Firebase project? Pass --project your-project-id or set it in .firebaserc.");

let via = "the local emulators";
if (!emulator) {
  if (key) via = `the key file ${keyPath}`;
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) via = "GOOGLE_APPLICATION_CREDENTIALS";
  else {
    const login = await firebaseLoginCredentials();
    via = login ? `your Firebase login (${login})` : "Application Default Credentials";
  }
}
console.log(`Project ${projectId}, using ${via}.`);

// Missing credentials surface from a background task of the Firestore client, so catch those too.
process.on("unhandledRejection", explain);
initializeApp(emulator ? { projectId } : { credential: key ? cert(key) : applicationDefault(), projectId });
const db = getFirestore();

try {
  const found = await db.collection("users").where("email", "==", email).limit(1).get();
  if (found.empty) {
    await db.collection("users").add({
      role: "master", full_name: name, email, advisor_code: null, region: null, active: true, uid: null,
      created_at: FieldValue.serverTimestamp(), created_by: "create-master script",
    });
  } else {
    const entry = found.docs[0];
    const u = entry.data();
    await entry.ref.update({ role: "master", active: true, ...(args.name ? { full_name: name } : {}) });
    if (u.uid) {
      // Already signed in before: make the change effective without waiting for the next sign-in.
      const auth = getAuth();
      await auth.updateUser(u.uid, { disabled: false }).catch(() => {});
      await auth.setCustomUserClaims(u.uid, { role: "master", pid: entry.id }).catch(() => {});
    }
  }
  console.log(`\nDone. ${email} is a master account in project ${projectId}.`);
  console.log("Open the app and choose \"Sign in with Google\" with that Google account.\n");
  process.exit(0);
} catch (e) {
  explain(e);
}

function explain(e) {
  const msg = String(e?.message ?? e);
  if (/does not exist|NOT_FOUND/i.test(msg)) fail("the Firestore database does not exist yet. Create it first (README, go-live step 3).");
  if (/credential|invalid_grant|invalid_rapt|PERMISSION_DENIED|UNAUTHENTICATED|insufficient/i.test(msg)) {
    fail(`no access to project ${projectId} with ${via}.\n` +
      "Run `npx firebase login` with an owner of the project, then try again. If it still fails, use a key file\n" +
      `instead (README, go-live step 8).\n(${msg})`);
  }
  fail(msg);
}
