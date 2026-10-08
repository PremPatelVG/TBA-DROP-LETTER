// Unit tests for the email/password authentication logic shared by the demo data layer and the server actions.
// Pure functions only (no emulator, no browser): run with `npm run test:unit`. Node strips the TypeScript types
// from the imported source at load time.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MIN_PASSWORD_LENGTH, passwordError } from "../../src/lib/validate.ts";
import { accessFor, canResetPassword, passwordSignIn } from "../../src/lib/data/authz.ts";

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
  const opsRajkot = { role: "operations", scope_type: "city", scope_value: "Rajkot" };
  const opsGujarat = { role: "operations", scope_type: "state", scope_value: "Gujarat" };
  const opsNoScope = { role: "operations", scope_type: null, scope_value: null };
  const advisorActor = { role: "advisor", scope_type: null, scope_value: null };

  const advRajkot = { role: "advisor", city: "Rajkot", state: "Gujarat" };
  const advAhmedabad = { role: "advisor", city: "Ahmedabad", state: "Gujarat" };
  const advMumbai = { role: "advisor", city: "Mumbai", state: "Maharashtra" };
  const anOpsUser = { role: "operations", city: null, state: null };
  const theMaster = { role: "master", city: null, state: null };

  test("master can reset any operations account or advisor, but not another master", () => {
    assert.equal(canResetPassword(master, advRajkot), true);
    assert.equal(canResetPassword(master, advMumbai), true);
    assert.equal(canResetPassword(master, anOpsUser), true);
    assert.equal(canResetPassword(master, theMaster), false);
  });

  test("an ops manager can reset advisors in its OWN region (happy path)", () => {
    assert.equal(canResetPassword(opsRajkot, advRajkot), true, "city scope: same city");
    assert.equal(canResetPassword(opsGujarat, advRajkot), true, "state scope: a city in the state");
    assert.equal(canResetPassword(opsGujarat, advAhmedabad), true, "state scope: another city in the state");
  });

  test("an ops manager CANNOT reset a user OUTSIDE its region (authorisation)", () => {
    assert.equal(canResetPassword(opsRajkot, advAhmedabad), false, "a city manager cannot reset another city's advisor");
    assert.equal(canResetPassword(opsRajkot, advMumbai), false, "nor another state's advisor");
    assert.equal(canResetPassword(opsGujarat, advMumbai), false, "a state manager cannot reach another state");
  });

  test("an ops manager can never reset another ops manager or the master", () => {
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
