import { buildingKey } from "@/lib/search";

// One drop entry is one letter, so every count below is a count of entries.
export type StatDrop = { advisor_id: string; building_name: string; responded: boolean; drop_date: string };
export type Totals = { letters: number; buildings: number; responses: number; rate: number };

/** Response rate in percent with one decimal: responded letters / letters. */
export const rate = (responses: number, letters: number) => (letters ? Math.round((responses / letters) * 1000) / 10 : 0);

/** Letters = entries. Buildings = distinct building names. */
export function totals(drops: StatDrop[]): Totals {
  const responses = drops.filter((d) => d.responded).length;
  return {
    letters: drops.length,
    buildings: new Set(drops.map((d) => buildingKey(d.building_name))).size,
    responses,
    rate: rate(responses, drops.length),
  };
}

/** Local calendar date as YYYY-MM-DD (not UTC, so early-morning dates are right in India). */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The last `n` calendar months, oldest first, with their first and last dates. */
export function lastMonths(n = 6, now = new Date()) {
  const out: { key: string; label: string; start: string; end: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    out.push({
      key: ymd(first).slice(0, 7),
      label: first.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      start: ymd(first),
      end: ymd(last),
    });
  }
  return out;
}

/**
 * The competition week runs Sunday 12:00 (noon) to the following Sunday 12:00 (noon), Asia/Kolkata (IST).
 * `currentWeek` returns it as YYYY-MM-DD strings {start, end}: `start` is the week's Sunday and `end` is the
 * following Saturday, so the window covers the seven dates Sunday..Saturday and the usual
 * `drop_date >= start && drop_date <= end` counting keeps working. One drop entry is one letter.
 *
 * The scheduled weekly job (functions/src/levels/rules.ts) uses the same Sunday-noon IST boundary, so the
 * belt leaderboard's "this week" count and the job's finalised week agree.
 */
export const WEEK_TIME_ZONE = "Asia/Kolkata";
// Shifting an instant back 12 hours turns the Sunday-noon boundary into a Sunday-midnight one, so the week it
// falls in can be found with plain date arithmetic on the IST calendar date. Before noon on a Sunday we are
// therefore still in the week that began the previous Sunday.
const NOON_SHIFT_MS = 12 * 60 * 60 * 1000;
const WEEK_DAY_MS = 86_400_000;

/** The calendar date of an instant in IST, as YYYY-MM-DD. */
function istDate(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: WEEK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const addDaysYmd = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * WEEK_DAY_MS).toISOString().slice(0, 10);
/** The Sunday on or before `date` (weeks are Sunday-led). */
const sundayOf = (date: string) => addDaysYmd(date, -new Date(`${date}T00:00:00Z`).getUTCDay());

export function currentWeek(now = new Date()) {
  const start = sundayOf(istDate(new Date(now.getTime() - NOON_SHIFT_MS)));
  return { start, end: addDaysYmd(start, 6) };
}
export const inWeek = (date: string, w: { start: string; end: string }) => date >= w.start && date <= w.end;
