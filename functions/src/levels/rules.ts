/**
 * Weekly level rules for advisors. Plain functions with no Firebase code, shared by the scheduled job
 * (weekly.ts), its tests, and the app's "Target levels" page (which explains the rules).
 *
 * - The competition week runs Sunday 12:00 (noon) to the following Sunday 12:00 (noon), India time
 *   (Asia/Kolkata). Each week is keyed by its Sunday. One drop entry is one letter.
 * - Meeting the level's weekly target 4 weeks in a row moves the advisor up one level.
 * - An advisor above the lowest level who misses the target 2 weeks in a row moves down one level.
 *   Nobody goes below the lowest level (200 letters by default).
 * - After any level change both streaks start again from zero.
 */

export const PROMOTE_AFTER_WEEKS = 4;
export const DEMOTE_AFTER_WEEKS = 2;
export const TIME_ZONE = "Asia/Kolkata";

export type Level = { id: number; name: string; target_letters: number; sort_order: number };
/** Stored on each advisor (users/{id}.level_state). `last_week` is the Sunday of the last week applied. */
export type LevelState = { met_streak: number; miss_streak: number; last_week: string | null };
export type Week = { start: string; end: string };
export type WeekOutcome = {
  week: Week;
  letters: number;
  target: number;
  met: boolean;
  from_level_id: number;
  to_level_id: number;
  change: "promoted" | "demoted" | null;
  reason: string | null;
  state: LevelState;
};

export const EMPTY_STATE: LevelState = { met_streak: 0, miss_streak: 0, last_week: null };

/** Levels from the lowest target to the highest. */
export const ladder = (levels: Level[]) => [...levels].sort((a, b) => a.sort_order - b.sort_order);

/** Applies one finished week to an advisor who is at `levelId` with `state`. Pure: returns the new level and state. */
export function applyWeek(levels: Level[], levelId: number, state: LevelState, week: Week, letters: number): WeekOutcome {
  const steps = ladder(levels);
  if (!steps.length) throw new Error("No levels defined.");
  const at = Math.max(0, steps.findIndex((l) => l.id === levelId));
  const level = steps[at];
  const met = letters >= level.target_letters;
  let met_streak = met ? state.met_streak + 1 : 0;
  let miss_streak = met ? 0 : state.miss_streak + 1;
  let to = at;
  let change: WeekOutcome["change"] = null;
  let reason: string | null = null;
  if (met && met_streak >= PROMOTE_AFTER_WEEKS && at < steps.length - 1) {
    to = at + 1;
    change = "promoted";
    reason = `Met the ${level.name} target (${level.target_letters} letters a week) ${PROMOTE_AFTER_WEEKS} weeks in a row`;
  } else if (!met && miss_streak >= DEMOTE_AFTER_WEEKS && at > 0) {
    to = at - 1;
    change = "demoted";
    reason = `Missed the ${level.name} target (${level.target_letters} letters a week) ${DEMOTE_AFTER_WEEKS} weeks in a row`;
  }
  if (change) {
    met_streak = 0;
    miss_streak = 0;
  }
  return {
    week, letters, target: level.target_letters, met, from_level_id: level.id, to_level_id: steps[to].id, change, reason,
    state: { met_streak, miss_streak, last_week: week.start },
  };
}

// ---------- dates (YYYY-MM-DD strings, as stored on drops) ----------

const DAY_MS = 86_400_000;
// Shifting an instant back 12 hours turns the Sunday-noon week boundary into a Sunday-midnight one, so the
// week it falls in can be found with plain date arithmetic on the IST calendar date.
const NOON_SHIFT_MS = 12 * 60 * 60 * 1000;

/** The calendar date of `at` in `timeZone`, as YYYY-MM-DD. */
export function localDate(at: Date, timeZone = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Sunday of the week that contains `date` (weeks are Sunday-led). */
export function sundayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -weekday);
}

/**
 * The last complete competition week before `at`: Sunday 12:00 noon IST to the following Sunday 12:00 noon IST.
 * The scheduled job runs at Sunday noon, when this is the week that just ended. Shifting `at` back 12 hours turns
 * the Sunday-noon boundary into a Sunday-midnight one so plain date maths finds the right week; before noon on a
 * Sunday we are still in the week that began the previous Sunday.
 */
export function previousWeek(at: Date, timeZone = TIME_ZONE): Week {
  const thisWeek = sundayOf(localDate(new Date(at.getTime() - NOON_SHIFT_MS), timeZone));
  const start = addDays(thisWeek, -7);
  return { start, end: addDays(start, 6) };
}

/**
 * The weeks (their Sundays) still to apply for one advisor, oldest first, ending with `lastWeek`:
 * the weeks after the last one applied, or, the first time, from the first full week after the advisor was
 * added. At most `max` weeks, so a long outage cannot replay months of history.
 */
export function weeksToApply(lastApplied: string | null, addedOn: string, lastWeek: string, max = 8): string[] {
  const firstFull = sundayOf(addedOn) === addedOn ? addedOn : addDays(sundayOf(addedOn), 7);
  let start = lastApplied ? addDays(sundayOf(lastApplied), 7) : firstFull;
  const earliest = addDays(lastWeek, -7 * (max - 1));
  if (start < earliest) start = earliest;
  const weeks: string[] = [];
  for (let w = start; w <= lastWeek; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}
