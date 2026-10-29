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

type Actor = Pick<Profile, "role" | "scope_type" | "scope_value">;
type Region = { city: string | null; state: string | null };

/**
 * Whether a regional (operations) `actor` covers `region`. national ⇒ every region; state ⇒ the whole state;
 * city ⇒ that one city. An account with no usable scope covers nothing (fail closed). This is the shared basis
 * for which advisors a regional account may see, create and manage, mirrored by scopeWhere()/inScope() in the
 * data layer and inScope() in firestore.rules.
 */
export function inOpsScope(actor: Actor, region: Region): boolean {
  if (actor.scope_type === "national") return true;
  if (actor.scope_type === "state" && actor.scope_value) return region.state === actor.scope_value;
  if (actor.scope_type === "city" && actor.scope_value) return region.city === actor.scope_value;
  return false;
}

/**
 * Whether `actor` may reset `target`'s password. The master can reset any regional account or advisor; a regional
 * account can reset ONLY advisors inside its own scope (national: any advisor; state: advisors in its state;
 * city: advisors in its city). A regional account can never reset another regional account or the master.
 * Advisors cannot reset anyone. The server action and the mock both gate on this before changing a password; the
 * Firestore security rules are unaffected (the auth method does not change roles or regions).
 */
export function canResetPassword(actor: Actor, target: Pick<Profile, "role" | "city" | "state">): boolean {
  if (actor.role === "master") return target.role === "advisor" || target.role === "operations";
  if (actor.role === "operations") {
    if (target.role !== "advisor") return false;
    return inOpsScope(actor, { city: target.city, state: target.state });
  }
  return false;
}

/**
 * Who may create an advisor, and where. The master may create an advisor in any region; a regional account may
 * create advisors only within its own scope (national: anywhere). Advisors cannot create anyone. The single
 * source of truth for both the UI and the server; a regional account's scope dimension is also forced on the
 * server so an advisor is always filed inside what the account can see.
 */
export function canCreateAdvisor(actor: Actor, region: Region): boolean {
  if (actor.role === "master") return true;
  if (actor.role === "operations") return inOpsScope(actor, region);
  return false;
}

/** Only the master may create, edit or deactivate the regional (operations) accounts. */
export function canManageRegionalAccounts(actor: Pick<Profile, "role">): boolean {
  return actor.role === "master";
}

/** Only the master may view or edit the belt thresholds. */
export function canEditBeltThresholds(actor: Pick<Profile, "role">): boolean {
  return actor.role === "master";
}

/**
 * Whether `actor` may deactivate or reactivate `target`. Same reach as {@link canResetPassword}: the master manages
 * any regional account or advisor; a regional account manages ONLY advisors inside its own scope (national: any
 * advisor). Fail closed: an operations account with no usable scope manages nobody. Self-deactivation is refused
 * separately by the callers.
 */
export function canSetUserActive(actor: Actor, target: Pick<Profile, "role" | "city" | "state">): boolean {
  return canResetPassword(actor, target);
}

/**
 * Whether `actor` may resend `target` the advisor welcome email (which sets a fresh temporary password). Only for
 * advisors, with the same regional reach as {@link canResetPassword}.
 */
export function canResendWelcome(actor: Actor, target: Pick<Profile, "role" | "city" | "state">): boolean {
  return target.role === "advisor" && canResetPassword(actor, target);
}
