import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, localDate, mondayOf, previousWeek } from "./week";

test("weeks run on the Monday-09:00 IST boundary", () => {
  // The job runs Monday 09:00 IST = Monday 03:30 UTC: the week that just ended is Mon 21 - Sun 27 Sept 2026.
  assert.deepEqual(previousWeek(new Date("2026-09-28T03:30:00Z")), { start: "2026-09-21", end: "2026-09-27" });
  // Just after 09:00 on Monday is still that ended week; just before 09:00 is still the previous one.
  assert.deepEqual(previousWeek(new Date("2026-09-28T03:31:00Z")), { start: "2026-09-21", end: "2026-09-27" });
  assert.deepEqual(previousWeek(new Date("2026-09-28T03:29:00Z")), { start: "2026-09-14", end: "2026-09-20" });
  assert.equal(localDate(new Date("2026-09-28T03:30:00Z")), "2026-09-28");
  assert.deepEqual(previousWeek(new Date("2026-01-05T03:30:00Z")), { start: "2025-12-29", end: "2026-01-04" }, "across a year end");
});

test("the Monday on or before a date, and the Mon..Sun window", () => {
  assert.equal(mondayOf("2026-09-21"), "2026-09-21", "a Monday is its own week start");
  assert.equal(mondayOf("2026-09-27"), "2026-09-21", "Sunday belongs to the week that began Monday");
  assert.equal(mondayOf("2026-09-28"), "2026-09-28", "the next Monday starts a new week");
  assert.equal(addDays("2026-09-21", 6), "2026-09-27", "the week covers the seven dates Monday..Sunday");
});
