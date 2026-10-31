// Unit tests for the drop response filters (status + contact method) shared by the demo data layer
// (src/lib/data/mock.ts) and the Firebase data layer (src/lib/data/firebase.ts, which also narrows the
// Firestore query), plus the response normaliser. Pure functions only: run with `npm run test:unit`.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { matchesResponse, responseStatusOf } from "../../src/lib/search.ts";
import { normaliseResponse } from "../../src/lib/validate.ts";

// The response model the Firestore rules enforce: pending and not interested ⇔ response_type "none";
// responded ⇔ "call"/"email".
const pending = { response_status: "pending", responded: false, response_type: "none" };
const declined = { response_status: "not_interested", responded: false, response_type: "none" };
const byCall = { response_status: "responded", responded: true, response_type: "call" };
const byEmail = { response_status: "responded", responded: true, response_type: "email" };
const all = [pending, declined, byCall, byEmail];

describe("matchesResponse: response-status and contact-method filters", () => {
  test("an empty filter matches every drop", () => {
    for (const d of all) assert.equal(matchesResponse(d, {}), true);
  });

  test("status: responded keeps only responded letters", () => {
    assert.deepEqual(all.map((d) => matchesResponse(d, { status: "responded" })), [false, false, true, true]);
  });

  test("status: pending keeps only letters with no response yet", () => {
    assert.deepEqual(all.map((d) => matchesResponse(d, { status: "pending" })), [true, false, false, false]);
  });

  test("status: not interested keeps only declined letters", () => {
    assert.deepEqual(all.map((d) => matchesResponse(d, { status: "not_interested" })), [false, true, false, false]);
  });

  test("contact method matches response_type exactly", () => {
    assert.deepEqual(all.map((d) => matchesResponse(d, { method: "call" })), [false, false, true, false]);
    assert.deepEqual(all.map((d) => matchesResponse(d, { method: "email" })), [false, false, false, true]);
    // "none" is the method of a pending or not-interested letter.
    assert.deepEqual(all.map((d) => matchesResponse(d, { method: "none" })), [true, true, false, false]);
  });

  test("status and method combine (both must hold)", () => {
    assert.equal(matchesResponse(byCall, { status: "responded", method: "call" }), true);
    assert.equal(matchesResponse(byEmail, { status: "responded", method: "call" }), false);
    assert.equal(matchesResponse(declined, { status: "not_interested", method: "none" }), true);
  });

  test("a contradictory status + method pair matches nothing", () => {
    for (const d of all) {
      assert.equal(matchesResponse(d, { status: "responded", method: "none" }), false);
      assert.equal(matchesResponse(d, { status: "not_interested", method: "call" }), false);
      assert.equal(matchesResponse(d, { status: "pending", method: "email" }), false);
    }
  });

  test("older records without a status are read from `responded`", () => {
    assert.equal(responseStatusOf({ responded: true }), "responded");
    assert.equal(responseStatusOf({ responded: false }), "pending");
    assert.equal(matchesResponse({ responded: false, response_type: "none" }, { status: "pending" }), true);
  });
});

describe("normaliseResponse: the stored shape follows the status", () => {
  const base = { response_status: "pending", responded: false, response_type: "none", response_date: null, response_notes: null, response_phone: null, response_email: null };

  test("responded needs a method, a date and the responder's phone or email", () => {
    const r = { ...base, response_status: "responded", response_type: "call", response_date: "2026-10-01" };
    assert.match(normaliseResponse(r).error, /phone number or the email/);
    const ok = normaliseResponse({ ...r, response_phone: "+91 98765 43210" });
    assert.equal(ok.error, null);
    assert.equal(ok.value.responded, true);
    assert.match(normaliseResponse({ ...r, response_type: "none", response_phone: "9876543210" }).error, /call or email/);
  });

  test("not interested needs a date and drops any method or contact", () => {
    assert.match(normaliseResponse({ ...base, response_status: "not_interested" }).error, /not interested/);
    const ok = normaliseResponse({ ...base, response_status: "not_interested", responded: true, response_type: "call", response_date: "2026-10-01", response_phone: "9876543210", response_notes: "No budget" });
    assert.equal(ok.error, null);
    assert.deepEqual(
      { responded: ok.value.responded, type: ok.value.response_type, phone: ok.value.response_phone, date: ok.value.response_date, notes: ok.value.response_notes },
      { responded: false, type: "none", phone: null, date: "2026-10-01", notes: "No budget" },
    );
  });

  test("pending clears date, method and contact, keeping notes", () => {
    const ok = normaliseResponse({ ...base, response_date: "2026-10-01", response_type: "email", response_email: "a@b.co", response_notes: "Left at reception" });
    assert.equal(ok.error, null);
    assert.equal(ok.value.response_date, null);
    assert.equal(ok.value.response_type, "none");
    assert.equal(ok.value.response_email, null);
    assert.equal(ok.value.response_notes, "Left at reception");
  });

  test("an unknown status is refused", () => {
    assert.match(normaliseResponse({ ...base, response_status: "maybe" }).error, /status/);
  });
});
