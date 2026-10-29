// Unit tests for the email/password authentication logic shared by the demo data layer and the server actions.
// Pure functions only (no emulator, no browser): run with `npm run test:unit`. Node strips the TypeScript types
// from the imported source at load time.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MIN_PASSWORD_LENGTH, passwordError } from "../../src/lib/validate.ts";
import { accessFor, canCreateAdvisor, canEditBeltThresholds, canManageRegionalAccount, canManageRegionalAccounts, manageableRegionalTiers, canResendWelcome, canResetPassword, canSetUserActive, inOpsScope, passwordSignIn } from "../../src/lib/data/authz.ts";

// A minimal access-list entry; only the fields these functions read need to be set.
const profile = (over) => ({
  id: "u", role: "advisor", full_name: "X", email: "x@example.com", advisor_code: null,
  city: null, state: null, zip: null, scope_type: null, scope_value: null, active: true, created_at: "", ...over,
});

describe("passwordError: a password being set (creation or reset)", () => {
  test(`rejects an empty or too-short password (min ${MIN_PASSWORD_LENGTH})`, () => {
    assert.equal(MIN_PASSWORD_LENGTH, 8);
    assert.equal(passwordError(""), "Enter a password.");
    assert.equal(passwordError("short"), "Password must be at least 8 characters.");
    assert.equal(passwordError("1234567"), "Password must be at least 8 characters.", "7 characters is too short");
  });
  test("accepts a password of at least the minimum length", () => {
    assert.equal(passwordError("12345678"), null, "exactly 8 is allowed");
    assert.equal(passwordError("demo1234"), null);
    assert.equal(passwordError("a-strong-password"), null);
  });
  test("rejects an absurdly long password", () => {
    assert.equal(passwordError("x".repeat(128)), null);
    assert.equal(passwordError("x".repeat(129)), "Password is too long (at most 128 characters).");
  });
});

describe("passwordSignIn: demo email+password check", () => {
  const profiles = [
    profile({ id: "u-adv", role: "advisor", email: "adv@example.com", active: true }),
    profile({ id: "u-off", role: "advisor", email: "off@example.com", active: false }),
  ];
  // "ghost" has credentials (a Firebase Auth account) but is NOT on the access list.
  const passwords = { "adv@example.com": "demo1234", "off@example.com": "demo1234", "ghost@example.com": "demo1234" };

  test("correct credentials for a listed, active user sign in", () => {
    const r = passwordSignIn(profiles, passwords, "adv@example.com", "demo1234");
    assert.ok("ok" in r);
    assert.equal(r.ok.status, "ok");
    assert.equal(r.ok.profile.id, "u-adv");
  });
  test("email is case-insensitive", () => {
    const r = passwordSignIn(profiles, passwords, "ADV@Example.com", "demo1234");
    assert.ok("ok" in r && r.ok.status === "ok");
  });
  test("a wrong password is refused with a generic message", () => {
    const r = passwordSignIn(profiles, passwords, "adv@example.com", "nope");
    assert.deepEqual(r, { error: "Incorrect email or password." });
  });
  test("an unknown email (no account) gets the SAME message as a wrong password", () => {
    const r = passwordSignIn(profiles, passwords, "nobody@example.com", "demo1234");
    assert.deepEqual(r, { error: "Incorrect email or password." });
  });
  test("valid credentials for an email that is not on the access list → not authorised", () => {
    const r = passwordSignIn(profiles, passwords, "ghost@example.com", "demo1234");
    assert.ok("ok" in r);
    assert.equal(r.ok.status, "not_authorised");
    assert.equal(r.ok.reason, "not_listed");
  });
  test("valid credentials for a deactivated user → not authorised (deactivated)", () => {
    const r = passwordSignIn(profiles, passwords, "off@example.com", "demo1234");
    assert.ok("ok" in r);
    assert.equal(r.ok.status, "not_authorised");
    assert.equal(r.ok.reason, "deactivated");
  });
  test("accessFor matches the sign-in outcome (listed + active = ok)", () => {
    assert.equal(accessFor(profiles, "adv@example.com").status, "ok");
    assert.equal(accessFor(profiles, "ghost@example.com").status, "not_authorised");
  });
});

describe("canResetPassword: who an admin may reset", () => {
  const master = { role: "master", scope_type: null, scope_value: null };
  const opsNational = { role: "operations", scope_type: "national", scope_value: null };
  const opsRajkot = { role: "operations", scope_type: "city", scope_value: "Rajkot" };
  const opsGujarat = { role: "operations", scope_type: "state", scope_value: "Gujarat" };
  const opsNoScope = { role: "operations", scope_type: null, scope_value: null };
  const advisorActor = { role: "advisor", scope_type: null, scope_value: null };

  const advRajkot = { role: "advisor", city: "Rajkot", state: "Gujarat" };
  const advAhmedabad = { role: "advisor", city: "Ahmedabad", state: "Gujarat" };
  const advMumbai = { role: "advisor", city: "Mumbai", state: "Maharashtra" };
  const anOpsUser = { role: "operations", city: null, state: null, scope_type: "national" };
  const theMaster = { role: "master", city: null, state: null };

  test("master can reset any regional account or advisor, but not another master", () => {
    assert.equal(canResetPassword(master, advRajkot), true);
    assert.equal(canResetPassword(master, advMumbai), true);
    assert.equal(canResetPassword(master, anOpsUser), true);
    assert.equal(canResetPassword(master, theMaster), false);
  });

  test("a national account (TBA India Ops) can reset any advisor, anywhere", () => {
    assert.equal(canResetPassword(opsNational, advRajkot), true);
    assert.equal(canResetPassword(opsNational, advAhmedabad), true);
    assert.equal(canResetPassword(opsNational, advMumbai), true, "national reaches another state too");
  });

  test("a national account still cannot reset another regional account or the master", () => {
    assert.equal(canResetPassword(opsNational, anOpsUser), false);
    assert.equal(canResetPassword(opsNational, theMaster), false);
  });

  test("a state/city president can reset advisors in its OWN region (happy path)", () => {
    assert.equal(canResetPassword(opsRajkot, advRajkot), true, "city scope: same city");
    assert.equal(canResetPassword(opsGujarat, advRajkot), true, "state scope: a city in the state");
    assert.equal(canResetPassword(opsGujarat, advAhmedabad), true, "state scope: another city in the state");
  });

  test("a state/city president CANNOT reset a user OUTSIDE its region (authorisation)", () => {
    assert.equal(canResetPassword(opsRajkot, advAhmedabad), false, "a city president cannot reset another city's advisor");
    assert.equal(canResetPassword(opsRajkot, advMumbai), false, "nor another state's advisor");
    assert.equal(canResetPassword(opsGujarat, advMumbai), false, "a state president cannot reach another state");
  });

  test("a president can never reset another regional account or the master", () => {
    assert.equal(canResetPassword(opsRajkot, anOpsUser), false);
    assert.equal(canResetPassword(opsGujarat, anOpsUser), false);
    assert.equal(canResetPassword(opsRajkot, theMaster), false);
  });

  test("an operations account with no scope manages no one (fail closed)", () => {
    assert.equal(canResetPassword(opsNoScope, advRajkot), false);
  });

  test("advisors cannot reset anyone", () => {
    assert.equal(canResetPassword(advisorActor, advRajkot), false);
    assert.equal(canResetPassword(advisorActor, advMumbai), false);
  });
});

describe("the role hierarchy: who creates and manages what", () => {
  const master = { role: "master", scope_type: null, scope_value: null };
  const opsNational = { role: "operations", scope_type: "national", scope_value: null };
  const opsGujarat = { role: "operations", scope_type: "state", scope_value: "Gujarat" };
  const opsRajkot = { role: "operations", scope_type: "city", scope_value: "Rajkot" };
  const advisorActor = { role: "advisor", scope_type: null, scope_value: null };
  const rajkot = { city: "Rajkot", state: "Gujarat" };
  const ahmedabad = { city: "Ahmedabad", state: "Gujarat" };
  const mumbai = { city: "Mumbai", state: "Maharashtra" };

  test("the Regional accounts screen: master and the national account only", () => {
    assert.equal(canManageRegionalAccounts(master), true);
    assert.equal(canManageRegionalAccounts(opsNational), true, "TBA India Ops manages state/city accounts");
    assert.equal(canManageRegionalAccounts(opsGujarat), false);
    assert.equal(canManageRegionalAccounts(opsRajkot), false);
    assert.equal(canManageRegionalAccounts(advisorActor), false);
    assert.deepEqual(manageableRegionalTiers(master), ["national", "state", "city"]);
    assert.deepEqual(manageableRegionalTiers(opsNational), ["state", "city"]);
    assert.deepEqual(manageableRegionalTiers(opsGujarat), []);
  });

  test("only master may edit the belt thresholds", () => {
    assert.equal(canEditBeltThresholds(master), true);
    assert.equal(canEditBeltThresholds(opsNational), false, "national sees everything but cannot edit thresholds");
    assert.equal(canEditBeltThresholds(opsRajkot), false);
    assert.equal(canEditBeltThresholds(advisorActor), false);
  });

  test("who can create an advisor, and where", () => {
    assert.equal(canCreateAdvisor(master, mumbai), true, "master: anywhere");
    assert.equal(canCreateAdvisor(opsNational, mumbai), true, "national: anywhere");
    assert.equal(canCreateAdvisor(opsNational, rajkot), true);
    assert.equal(canCreateAdvisor(opsGujarat, rajkot), true, "state: a city in its state");
    assert.equal(canCreateAdvisor(opsGujarat, ahmedabad), true);
    assert.equal(canCreateAdvisor(opsGujarat, mumbai), false, "state: not another state");
    assert.equal(canCreateAdvisor(opsRajkot, rajkot), true, "city: its own city");
    assert.equal(canCreateAdvisor(opsRajkot, ahmedabad), false, "city: not another city");
    assert.equal(canCreateAdvisor(advisorActor, rajkot), false, "advisors create no one");
  });

  test("inOpsScope: national ⇒ everywhere; state ⇒ its state; city ⇒ its city; else fail closed", () => {
    assert.equal(inOpsScope(opsNational, mumbai), true);
    assert.equal(inOpsScope(opsGujarat, rajkot), true);
    assert.equal(inOpsScope(opsGujarat, mumbai), false);
    assert.equal(inOpsScope(opsRajkot, rajkot), true);
    assert.equal(inOpsScope(opsRajkot, ahmedabad), false);
    assert.equal(inOpsScope({ role: "operations", scope_type: null, scope_value: null }, rajkot), false);
  });
});

describe("canSetUserActive / canResendWelcome: regional reach for deactivate, reactivate and resend welcome", () => {
  const master = { role: "master", scope_type: null, scope_value: null };
  const opsNational = { role: "operations", scope_type: "national", scope_value: null };
  const opsRajkot = { role: "operations", scope_type: "city", scope_value: "Rajkot" };
  const opsGujarat = { role: "operations", scope_type: "state", scope_value: "Gujarat" };
  const opsNoScope = { role: "operations", scope_type: null, scope_value: null };
  const advisorActor = { role: "advisor", scope_type: null, scope_value: null };
  const advRajkot = { role: "advisor", city: "Rajkot", state: "Gujarat" };
  const advAhmedabad = { role: "advisor", city: "Ahmedabad", state: "Gujarat" };
  const advMumbai = { role: "advisor", city: "Mumbai", state: "Maharashtra" };
  const anOpsUser = { role: "operations", city: null, state: null, scope_type: "national" };
  const theMaster = { role: "master", city: null, state: null };

  test("master and national reach any advisor", () => {
    for (const actor of [master, opsNational]) {
      for (const adv of [advRajkot, advAhmedabad, advMumbai]) {
        assert.equal(canSetUserActive(actor, adv), true);
        assert.equal(canResendWelcome(actor, adv), true);
      }
    }
  });
  test("a city account reaches only its own city's advisors", () => {
    assert.equal(canSetUserActive(opsRajkot, advRajkot), true);
    assert.equal(canSetUserActive(opsRajkot, advAhmedabad), false, "another city in the same state");
    assert.equal(canSetUserActive(opsRajkot, advMumbai), false);
    assert.equal(canResendWelcome(opsRajkot, advRajkot), true);
    assert.equal(canResendWelcome(opsRajkot, advAhmedabad), false);
  });
  test("a state account reaches only its own state's advisors", () => {
    assert.equal(canSetUserActive(opsGujarat, advAhmedabad), true);
    assert.equal(canSetUserActive(opsGujarat, advMumbai), false);
    assert.equal(canResendWelcome(opsGujarat, advMumbai), false);
  });
  test("only master manages operations accounts; nobody manages the master; welcome is advisors only", () => {
    assert.equal(canSetUserActive(master, anOpsUser), true);
    assert.equal(canSetUserActive(opsNational, anOpsUser), false);
    assert.equal(canSetUserActive(opsRajkot, anOpsUser), false);
    assert.equal(canSetUserActive(master, theMaster), false);
    assert.equal(canResendWelcome(master, anOpsUser), false);
  });
  test("fail closed: no scope or an advisor manages nobody", () => {
    assert.equal(canSetUserActive(opsNoScope, advRajkot), false);
    assert.equal(canSetUserActive(advisorActor, advRajkot), false);
    assert.equal(canResendWelcome(opsNoScope, advRajkot), false);
    assert.equal(canResendWelcome(advisorActor, advRajkot), false);
  });
});

describe("canManageRegionalAccount: who creates/edits/deactivates/resets regional accounts", () => {
  const master = { role: "master", scope_type: null, scope_value: null };
  const opsNational = { role: "operations", scope_type: "national", scope_value: null };
  const opsGujarat = { role: "operations", scope_type: "state", scope_value: "Gujarat" };
  const opsRajkot = { role: "operations", scope_type: "city", scope_value: "Rajkot" };
  const advisorActor = { role: "advisor", scope_type: null, scope_value: null };
  const natAcct = { role: "operations", city: null, state: null, scope_type: "national" };
  const stateAcct = { role: "operations", city: null, state: null, scope_type: "state" };
  const cityAcct = { role: "operations", city: null, state: null, scope_type: "city" };
  const theMaster = { role: "master", city: null, state: null, scope_type: null };

  test("master manages every tier, unchanged", () => {
    for (const t of ["national", "state", "city"]) assert.equal(canManageRegionalAccount(master, t), true, t);
    for (const t of [natAcct, stateAcct, cityAcct]) {
      assert.equal(canResetPassword(master, t), true);
      assert.equal(canSetUserActive(master, t), true);
    }
    assert.equal(canResetPassword(master, theMaster), false);
  });
  test("national (TBA India Ops) creates and manages state and city accounts", () => {
    assert.equal(canManageRegionalAccount(opsNational, "state"), true);
    assert.equal(canManageRegionalAccount(opsNational, "city"), true);
    for (const t of [stateAcct, cityAcct]) {
      assert.equal(canResetPassword(opsNational, t), true);
      assert.equal(canSetUserActive(opsNational, t), true);
      assert.equal(canResendWelcome(opsNational, t), false, "welcome email is for advisors only");
    }
  });
  test("national cannot manage national or master accounts, nor edit belt thresholds", () => {
    assert.equal(canManageRegionalAccount(opsNational, "national"), false);
    assert.equal(canResetPassword(opsNational, natAcct), false);
    assert.equal(canSetUserActive(opsNational, natAcct), false);
    assert.equal(canResetPassword(opsNational, theMaster), false);
    assert.equal(canSetUserActive(opsNational, theMaster), false);
    assert.equal(canEditBeltThresholds(opsNational), false);
  });
  test("state and city accounts and advisors cannot manage regional accounts", () => {
    for (const actor of [opsGujarat, opsRajkot, advisorActor]) {
      for (const t of ["national", "state", "city"]) assert.equal(canManageRegionalAccount(actor, t), false);
      for (const t of [natAcct, stateAcct, cityAcct, theMaster]) {
        assert.equal(canResetPassword(actor, t), false);
        assert.equal(canSetUserActive(actor, t), false);
      }
    }
  });
  test("fail closed: an unknown or missing tier is refused for everyone", () => {
    for (const actor of [master, opsNational]) {
      for (const t of [null, undefined, "", "global", "master"]) assert.equal(canManageRegionalAccount(actor, t), false, String(t));
      assert.equal(canResetPassword(actor, { role: "operations", city: null, state: null }), false);
    }
    assert.equal(canManageRegionalAccount({ role: "operations", scope_type: null }, "city"), false);
  });
});
