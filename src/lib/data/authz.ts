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

type Target = Pick<Profile, "role" | "city" | "state"> & { scope_type?: Profile["scope_type"] };

/**
 * Whether `actor` may reset `target`'s password. The master can reset any regional account or advisor. A regional
 * account can reset advisors inside its own scope (national: any advisor; state: its state; city: its city), and
 * the NATIONAL account (TBA India Ops) can also reset state and city regional accounts — never another national
 * account or the master (see {@link canManageRegionalAccount}). Advisors cannot reset anyone. The server action
 * and the mock both gate on this before changing a password.
 */
export function canResetPassword(actor: Actor, target: Target): boolean {
  if (target.role === "operations") return canManageRegionalAccount(actor, target.scope_type ?? null);
  if (actor.role === "master") return target.role === "advisor";
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

/**
 * The single source of truth for managing regional (operations) accounts: whether `actor` may create, edit,
 * deactivate/reactivate or reset the password of a regional account of tier `targetScopeType`.
 * - master: any tier (national, state, city);
 * - the national account (TBA India Ops): state and city accounts only — never another national account;
 * - state/city accounts and advisors: nothing.
 * Master accounts are never regional accounts and are not managed through this. Fail closed: an unknown or
 * missing tier is refused for everyone, master included.
 */
export function canManageRegionalAccount(actor: Pick<Profile, "role" | "scope_type">, targetScopeType: string | null | undefined): boolean {
  if (targetScopeType !== "national" && targetScopeType !== "state" && targetScopeType !== "city") return false;
  if (actor.role === "master") return true;
  if (actor.role === "operations" && actor.scope_type === "national") return targetScopeType === "state" || targetScopeType === "city";
  return false;
}

/** The regional-account tiers `actor` may create (empty ⇒ no access to the Regional accounts screen). */
export function manageableRegionalTiers(actor: Pick<Profile, "role" | "scope_type">): ("national" | "state" | "city")[] {
  return (["national", "state", "city"] as const).filter((t) => canManageRegionalAccount(actor, t));
}

/** Whether `actor` may open the Regional accounts screen at all: master, or the national account. */
export function canManageRegionalAccounts(actor: Pick<Profile, "role" | "scope_type">): boolean {
  return manageableRegionalTiers(actor).length > 0;
}

/** Only the master may view or edit the belt thresholds. */
export function canEditBeltThresholds(actor: Pick<Profile, "role">): boolean {
  return actor.role === "master";
}

/**
 * Whether `actor` may deactivate or reactivate `target`. Same reach as {@link canResetPassword}: the master manages
 * any regional account or advisor; national also manages state/city accounts; a regional account otherwise
 * manages ONLY advisors inside its own scope (national: any advisor). Fail closed: an operations account with no usable scope manages nobody. Self-deactivation is refused
 * separately by the callers.
 */
export function canSetUserActive(actor: Actor, target: Target): boolean {
  return canResetPassword(actor, target);
}

/**
 * Whether `actor` may resend `target` the welcome email (which sets a fresh temporary password). Advisors: the same
 * regional reach as {@link canResetPassword}. Regional accounts: {@link canManageRegionalAccount} (master: national,
 * state and city; national: state and city). Never the master account.
 */
export function canResendWelcome(actor: Actor, target: Target): boolean {
  if (target.role === "advisor") return canResetPassword(actor, target);
  if (target.role === "operations") return canManageRegionalAccount(actor, target.scope_type ?? null);
  return false;
}

/**
 * Whether `actor` may edit `target`'s details (name, phone, region; never the login email). The same people who
 * already manage the account: advisors as {@link canResetPassword} (master: any; a regional account: advisors in its
 * own scope, national: any advisor); regional accounts by {@link canManageRegionalAccount} (master: any tier;
 * national: state and city). Never the master account. Moving an advisor to another region is further checked
 * with {@link canCreateAdvisor} on the NEW region, so a regional account cannot move an advisor out of its scope.
 */
export function canEditAccount(actor: Actor, target: Target): boolean {
  return canResendWelcome(actor, target);
}
