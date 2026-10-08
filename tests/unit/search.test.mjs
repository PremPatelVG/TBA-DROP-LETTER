// Unit tests for the drop response filters (status + contact method) shared by the demo data layer
// (src/lib/data/mock.ts) and the Firebase data layer (src/lib/data/firebase.ts, which also narrows the
// Firestore query). Pure function only (no emulator, no browser): run with `npm run test:unit`.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { matchesResponse } from "../../src/lib/search.ts";

// A drop carrying only the fields matchesResponse reads. The binary response model the Firestore rules
// enforce: not responded ⇔ response_type "none"; responded ⇔ "call"/"email".
const pending = { responded: false, response_type: "none" };
const byCall = { responded: true, response_type: "call" };
const byEmail = { responded: true, response_type: "email" };

describe("matchesResponse: response-status and contact-method filters", () => {
  test("an empty filter matches every drop (no behaviour change until used)", () => {
    for (const d of [pending, byCall, byEmail]) assert.equal(matchesResponse(d, {}), true);
  });

  test("status: responded true keeps only responded letters", () => {
    assert.equal(matchesResponse(byCall, { responded: true }), true);
    assert.equal(matchesResponse(byEmail, { responded: true }), true);
    assert.equal(matchesResponse(pending, { responded: true }), false);
  });

  test("status: responded false keeps only not-yet-responded letters", () => {
    assert.equal(matchesResponse(pending, { responded: false }), true);
    assert.equal(matchesResponse(byCall, { responded: false }), false);
    assert.equal(matchesResponse(byEmail, { responded: false }), false);
  });

  test("contact method matches response_type exactly", () => {
    assert.equal(matchesResponse(byCall, { method: "call" }), true);
    assert.equal(matchesResponse(byEmail, { method: "call" }), false);
    assert.equal(matchesResponse(byEmail, { method: "email" }), true);
    assert.equal(matchesResponse(byCall, { method: "email" }), false);
    // "none" is the method of a letter not yet responded to.
    assert.equal(matchesResponse(pending, { method: "none" }), true);
    assert.equal(matchesResponse(byCall, { method: "none" }), false);
  });

  test("status and method combine (both must hold)", () => {
    assert.equal(matchesResponse(byCall, { responded: true, method: "call" }), true);
    assert.equal(matchesResponse(byEmail, { responded: true, method: "call" }), false);
    assert.equal(matchesResponse(pending, { responded: false, method: "none" }), true);
  });

  test("a contradictory status + method pair matches nothing", () => {
    // responded = true but method = none (a responded letter is never "none"): no drop can satisfy both.
    for (const d of [pending, byCall, byEmail]) {
      assert.equal(matchesResponse(d, { responded: true, method: "none" }), false);
      assert.equal(matchesResponse(d, { responded: false, method: "call" }), false);
    }
  });
});
