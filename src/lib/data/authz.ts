import type { AccessResult, Profile } from "./types";

/**
 * Pure authentication/authorisation decisions shared by the demo data layer (`mock.ts`), the Firebase server
 * actions (`src/app/actions.ts`) and the unit tests. No imports beyond types, no browser or server APIs, so the
 * same rules are enforced everywhere and can be tested on their own. The email/password SIGN-IN itself is handled
 * by Firebase Authentication in production; here we only decide who the authenticated email maps to, and who an
 * admin may reset a password for. Passwords are never stored or compared here in production (see `passwordSignIn`,
 * which is demo-only).
 */

const cleanEmail = (e: string) => e.trim().toLowerCase();

/** The access decision for an email: on the list and active → ok; otherwise not authorised. */
export function accessFor(profiles: Profile[], email: string): AccessResult {
  const p = profiles.find((x) => x.email === cleanEmail(email));
  if (!p) return { status: "not_authorised", email, reason: "not_listed" };
  if (!p.active) return { status: "not_authorised", email, reason: "deactivated" };
  return { status: "ok", profile: p };
}

/**
 * Demo-only email+password sign-in decision. `passwords` maps an email to the account's password; it stands in
 * for Firebase Authentication, which stores and checks the real credentials in production. Returns the access
 * outcome once the credentials match, or a single error message for a wrong password OR an unknown email (the
 * same message for both, as Firebase Auth does, so an attacker cannot tell which emails exist).
 */
export function passwordSignIn(
  profiles: Profile[],
  passwords: Record<string, string>,
  email: string,
  password: string,
): { ok: AccessResult } | { error: string } {
  const stored = passwords[cleanEmail(email)];
  if (!stored || stored !== password) return { error: "Incorrect email or password." };
  return { ok: accessFor(profiles, email) };
}

/**
 * Whether `actor` may reset `target`'s password. The master can reset any operations account or advisor; an
 * operations account can reset ONLY advisors inside its own franchise region (its city, or every city in its
 * state). An operations account can never reset another operations account or the master, nor an advisor outside
 * its region. Advisors cannot reset anyone. The server action and the mock both gate on this before changing a
 * password; the Firestore security rules are unaffected (the auth method does not change roles or regions).
 */
export function canResetPassword(
  actor: Pick<Profile, "role" | "scope_type" | "scope_value">,
  target: Pick<Profile, "role" | "city" | "state">,
): boolean {
  if (actor.role === "master") return target.role === "advisor" || target.role === "operations";
  if (actor.role === "operations") {
    if (target.role !== "advisor") return false;
    if (actor.scope_type === "city" && actor.scope_value) return target.city === actor.scope_value;
    if (actor.scope_type === "state" && actor.scope_value) return target.state === actor.scope_value;
    return false; // an operations account with no scope manages no one (fail closed)
  }
  return false;
}
