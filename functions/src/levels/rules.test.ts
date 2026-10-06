import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, applyWeek, EMPTY_STATE, localDate, sundayOf, previousWeek, weeksToApply, type Level, type LevelState } from "./rules";

const LEVELS: Level[] = [
  { id: 3, name: "Level 3", target_letters: 500, sort_order: 3 },
  { id: 1, name: "Level 1", target_letters: 200, sort_order: 1 },
  { id: 2, name: "Level 2", target_letters: 350, sort_order: 2 },
];
// Week starts are Sundays (the competition week runs Sunday noon to Sunday noon IST).
const SUNDAYS = ["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20"];
const week = (i: number) => ({ start: SUNDAYS[i], end: addDays(SUNDAYS[i], 6) });

/** Applies a run of weekly letter counts; returns the level after each week. */
function run(levelId: number, letters: number[], levels = LEVELS) {
  let state: LevelState = EMPTY_STATE;
  let level = levelId;
  const seen: number[] = [];
  letters.forEach((n, i) => {
    const r = applyWeek(levels, level, state, { start: SUNDAYS[i % SUNDAYS.length], end: "" }, n);
    state = r.state;
    level = r.to_level_id;
    seen.push(level);
  });
  return { seen, state, level };
}

test("meeting the target 4 weeks in a row moves up one level", () => {
  assert.deepEqual(run(1, [200, 250, 210, 199]).seen, [1, 1, 1, 1], "3 weeks then a miss: no promotion");
  assert.deepEqual(run(1, [200, 250, 210, 300]).seen, [1, 1, 1, 2]);
});

test("a missed week restarts the streak", () => {
  assert.deepEqual(run(1, [200, 200, 200, 10, 200, 200, 200]).seen, [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(run(1, [200, 200, 200, 10, 200, 200, 200, 200]).seen.at(-1), 2);
});

test("after a promotion the new level's target applies and the streaks start again", () => {
  // Promoted after week 4; 350 is now needed, so 4 more weeks of 300 do not promote again.
  assert.deepEqual(run(1, [200, 200, 200, 200, 300, 360, 360, 360]).seen, [1, 1, 1, 2, 2, 2, 2, 2]);
  assert.deepEqual(run(1, [200, 200, 200, 200, 350, 350, 350, 350]).seen, [1, 1, 1, 2, 2, 2, 2, 3]);
});

test("a promoted advisor who misses 2 weeks in a row moves down one level", () => {
  assert.deepEqual(run(2, [100]).seen, [2], "one miss is not enough");
  assert.deepEqual(run(2, [100, 349]).seen, [2, 1]);
  assert.deepEqual(run(3, [499, 499, 100, 100]).seen, [3, 2, 2, 1], "one level at a time");
  assert.deepEqual(run(2, [100, 400, 100]).seen, [2, 2, 2], "a met week in between restarts the count");
});

test("never below the lowest level, never above the highest", () => {
  const low = run(1, [0, 0, 0, 0, 0]);
  assert.equal(low.level, 1);
  assert.equal(low.state.miss_streak, 5);
  assert.deepEqual(run(3, [600, 600, 600, 600, 600]).seen, [3, 3, 3, 3, 3]);
});

test("uses the level targets as edited", () => {
  const edited = LEVELS.map((l) => (l.id === 1 ? { ...l, target_letters: 150 } : l));
  assert.deepEqual(run(1, [150, 160, 170, 180], edited).seen, [1, 1, 1, 2]);
});

test("the outcome records the week, target, change and reason", () => {
  const state: LevelState = { met_streak: 3, miss_streak: 0, last_week: "2026-08-16" };
  const r = applyWeek(LEVELS, 1, state, week(3), 240);
  assert.equal(r.change, "promoted");
  assert.equal(r.from_level_id, 1);
  assert.equal(r.to_level_id, 2);
  assert.equal(r.target, 200);
  assert.equal(r.met, true);
  assert.match(r.reason!, /Level 1 target \(200 letters a week\) 4 weeks in a row/);
  assert.deepEqual(r.state, { met_streak: 0, miss_streak: 0, last_week: "2026-08-23" });
  const d = applyWeek(LEVELS, 2, { met_streak: 0, miss_streak: 1, last_week: "2026-08-16" }, week(3), 12);
  assert.equal(d.change, "demoted");
  assert.match(d.reason!, /Missed the Level 2 target \(350 letters a week\) 2 weeks in a row/);
});

test("weeks run on the Sunday-noon IST boundary", () => {
  // The job runs Sunday 12:00 noon IST = Sunday 06:30 UTC: the week that just ended is Sun 20 - Sat 26 Sept.
  assert.deepEqual(previousWeek(new Date("2026-09-27T06:30:00Z")), { start: "2026-09-20", end: "2026-09-26" });
  // Just after noon on Sunday is still that ended week; just before noon is still the previous one.
  assert.deepEqual(previousWeek(new Date("2026-09-27T06:31:00Z")), { start: "2026-09-20", end: "2026-09-26" });
  assert.deepEqual(previousWeek(new Date("2026-09-27T06:29:00Z")), { start: "2026-09-13", end: "2026-09-19" });
  assert.equal(localDate(new Date("2026-09-27T06:30:00Z")), "2026-09-27");
  assert.equal(sundayOf("2026-09-26"), "2026-09-20");
  assert.equal(sundayOf("2026-09-27"), "2026-09-27");
  assert.deepEqual(previousWeek(new Date("2026-01-04T06:30:00Z")), { start: "2025-12-28", end: "2026-01-03" }, "across a year end");
});

test("which weeks to apply", () => {
  assert.deepEqual(weeksToApply("2026-09-13", "2026-01-01", "2026-09-20"), ["2026-09-20"], "normal weekly run");
  assert.deepEqual(weeksToApply("2026-09-20", "2026-01-01", "2026-09-20"), [], "already applied");
  assert.deepEqual(weeksToApply("2026-08-30", "2026-01-01", "2026-09-20"), ["2026-09-06", "2026-09-13", "2026-09-20"], "catches up missed runs");
  assert.deepEqual(weeksToApply(null, "2026-09-16", "2026-09-20"), ["2026-09-20"], "added mid-week: starts with the first full week");
  assert.deepEqual(weeksToApply(null, "2026-09-13", "2026-09-20"), ["2026-09-13", "2026-09-20"], "added on a Sunday: that week counts");
  assert.deepEqual(weeksToApply(null, "2026-09-22", "2026-09-20"), [], "added this week: nothing yet");
  assert.equal(weeksToApply(null, "2025-01-01", "2026-09-20").length, 8, "at most 8 weeks at once");
});
