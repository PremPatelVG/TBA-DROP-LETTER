/**
 * Competition-week date maths for the weekly snapshot job (snapshot.ts) and its tests. Plain functions with
 * no Firebase code. The same algorithm runs in the app (currentWeek() in src/lib/stats.ts), so the belt
 * leaderboard's "this week" count and the job's finalised week always agree.
 *
 * The competition week runs Monday 09:00 to the following Monday 09:00, India time (Asia/Kolkata), and is
 * keyed by its Monday. One drop entry is one letter.
 */

export const TIME_ZONE = "Asia/Kolkata";
export type Week = { start: string; end: string };

const DAY_MS = 86_400_000;
// Shifting an instant back 9 hours turns the Monday-09:00 week boundary into a Monday-midnight one, so the
// week it falls in can be found with plain date arithmetic on the IST calendar date.
const MORNING_SHIFT_MS = 9 * 60 * 60 * 1000;

/** The calendar date of `at` in `timeZone`, as YYYY-MM-DD. */
export function localDate(at: Date, timeZone = TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday on or before `date` (weeks are Monday-led). */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday, 1 = Monday
  return addDays(date, -((weekday + 6) % 7));
}

/**
 * The last complete competition week before `at`: Monday 09:00 IST to the following Monday 09:00 IST.
 * The scheduled job runs Monday 09:00, when this is the week that just ended. Shifting `at` back 9 hours turns
 * the Monday-09:00 boundary into a Monday-midnight one so plain date maths finds the right week; before 09:00
 * on a Monday we are still in the week that began the previous Monday.
 */
export function previousWeek(at: Date, timeZone = TIME_ZONE): Week {
  const thisWeek = mondayOf(localDate(new Date(at.getTime() - MORNING_SHIFT_MS), timeZone));
  const start = addDays(thisWeek, -7);
  return { start, end: addDays(start, 6) };
}
