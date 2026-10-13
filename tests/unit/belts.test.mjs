// Unit tests for the pure belt logic (src/lib/belts.ts): classifying a weekly entry count against thresholds,
// the next-belt gap, and validating a set of thresholds the master edits. Run with `npm run test:unit`.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { beltThresholdsError, classify, DEFAULT_BELT_THRESHOLDS, nextBelt } from "../../src/lib/belts.ts";

describe("classify: the belt for a weekly entry count, given thresholds", () => {
  const t = DEFAULT_BELT_THRESHOLDS;
  test("default boundaries (red < 200, yellow 200-349, blue 350-500, green 501+)", () => {
    assert.equal(classify(0, t).key, "red");
    assert.equal(classify(199, t).key, "red");
    assert.equal(classify(200, t).key, "yellow");
    assert.equal(classify(349, t).key, "yellow");
    assert.equal(classify(350, t).key, "blue");
    assert.equal(classify(500, t).key, "blue");
    assert.equal(classify(501, t).key, "green");
    assert.equal(classify(99999, t).key, "green");
  });
  test("the resolved belt carries its inclusive lower bound", () => {
    assert.equal(classify(0, t).min, 0);
    assert.equal(classify(250, t).min, 200);
    assert.equal(classify(400, t).min, 350);
    assert.equal(classify(600, t).min, 501);
  });
  test("custom thresholds move the boundaries (Red ceiling 200 -> 250)", () => {
    const moved = { yellowMin: 250, blueMin: 350, greenMin: 501 };
    assert.equal(classify(200, moved).key, "red", "200 is now Red, not Yellow");
    assert.equal(classify(249, moved).key, "red");
    assert.equal(classify(250, moved).key, "yellow");
  });
});

describe("nextBelt: the gap to the next belt up", () => {
  const t = DEFAULT_BELT_THRESHOLDS;
  test("needed entries to the next belt", () => {
    assert.deepEqual([nextBelt(0, t).belt.key, nextBelt(0, t).needed], ["yellow", 200]);
    assert.equal(nextBelt(199, t).needed, 1, "one more entry reaches Yellow");
    assert.equal(nextBelt(200, t).belt.key, "blue");
    assert.equal(nextBelt(200, t).needed, 150);
  });
  test("null at the top belt (green)", () => {
    assert.equal(nextBelt(501, t), null);
    assert.equal(nextBelt(10000, t), null);
  });
});

describe("beltThresholdsError: validating an edit", () => {
  test("the defaults are valid", () => {
    assert.equal(beltThresholdsError(DEFAULT_BELT_THRESHOLDS), null);
    assert.equal(beltThresholdsError({ yellowMin: 250, blueMin: 400, greenMin: 600 }), null);
  });
  test("each boundary must be a whole number greater than 0", () => {
    assert.ok(beltThresholdsError({ yellowMin: 0, blueMin: 350, greenMin: 501 }));
    assert.ok(beltThresholdsError({ yellowMin: -5, blueMin: 350, greenMin: 501 }));
    assert.ok(beltThresholdsError({ yellowMin: 200.5, blueMin: 350, greenMin: 501 }));
    assert.ok(beltThresholdsError({ yellowMin: Number.NaN, blueMin: 350, greenMin: 501 }));
  });
  test("the boundaries must strictly increase", () => {
    assert.ok(beltThresholdsError({ yellowMin: 350, blueMin: 350, greenMin: 501 }), "yellow == blue");
    assert.ok(beltThresholdsError({ yellowMin: 400, blueMin: 350, greenMin: 501 }), "yellow > blue");
    assert.ok(beltThresholdsError({ yellowMin: 200, blueMin: 501, greenMin: 501 }), "blue == green");
    assert.ok(beltThresholdsError({ yellowMin: 200, blueMin: 600, greenMin: 501 }), "blue > green");
  });
});
