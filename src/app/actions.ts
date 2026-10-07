"use server";

// Server actions for the Firebase back end (not used with demo data). Every action receives the caller's
// Firebase ID token, verifies it with the Admin SDK (including revoked sessions and disabled accounts) and
// checks the caller's role and access-list entry before doing anything. Roles live in custom claims
// ({ role, pid }), which only this file sets. Access-list documents (users/*) can only be written here:
// the security rules refuse all client writes to them.

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isEmail } from "@/lib/validate";
import type { NewAdvisor, NewOpsUser, Profile, Role } from "@/lib/data/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type ClaimResult =
  | { status: "ok"; profile: Profile; claimsChanged: boolean }
  | { status: "not_authorised"; email: string | null; reason: "not_listed" | "deactivated" }
  | { status: "error"; message: string };

const ROLES: Role[] = ["advisor", "operations", "master"];

/** A message meant for the person using the app (anything else is logged and replaced by a generic one). */
class Refusal extends Error {}

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" ? v : new Date().toISOString());

function toProfile(snap: DocumentSnapshot): Profile {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    role: d.role,
    full_name: d.full_name ?? "",
    email: d.email ?? "",
    advisor_code: d.advisor_code ?? null,
    region: d.region ?? null,
    active: d.active === true,
    created_at: iso(d.created_at),
  };
}

const code = (e: unknown) => (typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "");

async function run<T>(what: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, error: e.message };
    console.error(`${what} failed`, e);
    return { ok: false, error: `Could not ${what}. Please try again.` };
  }
}

/** Verifies the token (signature, expiry, revoked sessions, disabled accounts) and the caller's access entry. */
async function caller(idToken: string, roles: Role[]) {
  let token: DecodedIdToken;
  try {
    token = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    throw new Refusal("Your session has ended. Sign in again.");
  }
  const pid = typeof token.pid === "string" ? token.pid : null;
  if (!pid || !roles.includes(token.role)) throw new Refusal("You are not allowed to do this.");
  const snap = await adminDb().collection("users").doc(pid).get();
  const u = snap.data();
  if (!u || u.active !== true || u.uid !== token.uid || u.role !== token.role) throw new Refusal("You are not allowed to do this.");
  return { uid: token.uid, pid, role: token.role as Role };
}

/**
 * Called after Google sign-in when the ID token has no role yet (or the rules refused a read).
 * Listed and active: sets the { role, pid } claims and links the Firebase account to the access entry.
 * Not listed: deletes the Firebase account that the sign-in created. Deactivated: disables it.
 */
export async function claimAccess(idToken: string): Promise<ClaimResult> {
  const auth = adminAuth();
  let token: DecodedIdToken;
  try {
    token = await auth.verifyIdToken(idToken, true);
  } catch (e) {
    if (code(e) === "auth/user-disabled") return { status: "not_authorised", email: null, reason: "deactivated" };
    if (code(e) === "auth/id-token-revoked") {
      // Sessions are revoked when someone is deactivated; tell them so if that is still the case.
      const old = await auth.verifyIdToken(idToken).catch(() => null);
      const entry = old?.email ? await findByEmail(old.email) : null;
      if (entry && entry.data()?.active !== true) return { status: "not_authorised", email: old!.email!.toLowerCase(), reason: "deactivated" };
      return { status: "error", message: "Your session has ended. Sign in again." };
    }
    console.error("claimAccess: token check failed", e);
    return { status: "error", message: "Could not check your sign-in. Please try again." };
  }

  const email = (token.email ?? "").toLowerCase();
  const google = token.firebase?.sign_in_provider === "google.com" && token.email_verified === true;
  const entry = email && google ? await findByEmail(email) : null;
  if (!entry) {
    // Firebase creates an account on every Google sign-in; remove the ones that are not on the list.
    await auth.deleteUser(token.uid).catch(() => {});
    return { status: "not_authorised", email: email || null, reason: "not_listed" };
  }
  const u = entry.data()!;
  if (u.active !== true || !ROLES.includes(u.role)) {
    await auth.updateUser(token.uid, { disabled: true }).catch(() => {});
    await auth.revokeRefreshTokens(token.uid).catch(() => {});
    return { status: "not_authorised", email, reason: "deactivated" };
  }
  if (u.uid && u.uid !== token.uid) {
    // The same Google account came back as a new Firebase account (the old one was deleted): move access over.
    await auth.setCustomUserClaims(u.uid, null).catch(() => {});
  }
  const claimsChanged = token.role !== u.role || token.pid !== entry.id;
  if (claimsChanged) await auth.setCustomUserClaims(token.uid, { role: u.role, pid: entry.id });
  if (u.uid !== token.uid || claimsChanged) {
    await entry.ref.update({ uid: token.uid, last_sign_in_at: FieldValue.serverTimestamp() });
  }
  return { status: "ok", profile: toProfile(entry), claimsChanged };
}

async function findByEmail(email: string) {
  const found = await adminDb().collection("users").where("email", "==", email.toLowerCase()).limit(1).get();
  return found.empty ? null : found.docs[0];
}

function text(v: unknown, label: string, max: number) {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  if (!s) throw new Refusal(`${label} is required.`);
  if (s.length > max) throw new Refusal(`${label} is too long (at most ${max} characters).`);
  return s;
}
function googleEmail(v: unknown) {
  const e = String(v ?? "").trim().toLowerCase();
  if (!isEmail(e)) throw new Refusal("Enter the person's Google account email, for example name@gmail.com.");
  return e;
}

/** Operations or master: add an advisor to the access list. They sign in with Google using `email`. */
export async function createAdvisor(idToken: string, input: NewAdvisor): Promise<ActionResult<Profile>> {
  return run("add the advisor", async () => {
    const me = await caller(idToken, ["operations", "master"]);
    const full_name = text(input.full_name, "Name", 100);
    const advisor_code = text(input.advisor_code, "Advisor ID", 32).toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(advisor_code)) throw new Refusal("Advisor ID: 3-32 letters, digits, - or _.");
    const region = text(input.region, "Region", 100);
    const email = googleEmail(input.email);

    const db = adminDb();
    const ref = db.collection("users").doc();
    await db.runTransaction(async (tx) => {
      const [byEmail, byCode] = await Promise.all([
        tx.get(db.collection("users").where("email", "==", email).limit(1)),
        tx.get(db.collection("users").where("advisor_code", "==", advisor_code).limit(1)),
      ]);
      if (!byEmail.empty) throw new Refusal(`${email} is already on the list.`);
      if (!byCode.empty) throw new Refusal(`Advisor ID ${advisor_code} already exists.`);
      tx.create(ref, {
        role: "advisor", full_name, email, advisor_code, region, active: true, uid: null,
        created_at: FieldValue.serverTimestamp(), created_by: me.pid,
      });
    });
    return toProfile(await ref.get());
  });
}

/** Master only: add an operations person to the access list. */
export async function createOpsUser(idToken: string, input: NewOpsUser): Promise<ActionResult<Profile>> {
  return run("add the operations account", async () => {
    const me = await caller(idToken, ["master"]);
    const full_name = text(input.full_name, "Name", 100);
    const email = googleEmail(input.email);
    const db = adminDb();
    const ref = db.collection("users").doc();
    await db.runTransaction(async (tx) => {
      const byEmail = await tx.get(db.collection("users").where("email", "==", email).limit(1));
      if (!byEmail.empty) throw new Refusal(`${email} is already on the list.`);
      tx.create(ref, {
        role: "operations", full_name, email, advisor_code: null, region: null, active: true, uid: null,
        created_at: FieldValue.serverTimestamp(), created_by: me.pid,
      });
    });
    return toProfile(await ref.get());
  });
}

/**
 * Deactivate or reactivate someone. Operations and master: advisors. Master only: operations accounts.
 * Deactivating also disables their Firebase account and revokes their sessions; the security rules
 * already refuse every read and write from an inactive entry.
 */
export async function setUserActive(idToken: string, id: string, active: boolean): Promise<ActionResult<null>> {
  return run(active ? "reactivate the account" : "deactivate the account", async () => {
    const me = await caller(idToken, ["operations", "master"]);
    if (id === me.pid) throw new Refusal("You cannot deactivate yourself.");
    const ref = adminDb().collection("users").doc(id);
    const snap = await ref.get();
    const t = snap.data();
    if (!t) throw new Refusal("User not found.");
    const allowed = t.role === "advisor" || (t.role === "operations" && me.role === "master");
    if (!allowed) throw new Refusal("Only master can manage operations accounts.");
    await ref.update({ active, updated_at: FieldValue.serverTimestamp(), updated_by: me.pid });
    if (t.uid) {
      const auth = adminAuth();
      await auth.updateUser(t.uid, { disabled: !active }).catch((e) => { if (code(e) !== "auth/user-not-found") throw e; });
      if (!active) await auth.revokeRefreshTokens(t.uid).catch((e) => { if (code(e) !== "auth/user-not-found") throw e; });
    }
    return null;
  });
}
