/**
 * Belt ranking for advisors, based on the number of drop entries in the current competition week
 * (entries this week; see currentWeek() in src/lib/stats.ts — the week runs Monday 09:00 to the
 * following Monday 09:00, IST). One drop entry is one letter.
 *
 * To rank on all-time totals instead of this week later, pass the all-time entry count to beltFor()/
 * nextBelt() in place of the weekly count; the thresholds below do not change.
 *
 * Thresholds (entries this week):
 *   Red belt     fewer than 200
 *   Yellow belt  200 to 349
 *   Blue belt    350 to 500 (inclusive)
 *   Green belt   more than 500 (501+)
 *
 * These belt colours are a ranking scale and are independent of the app's green/white brand chrome: the
 * brand green is a deep green-700, while the GREEN BELT uses a distinct bright emerald tone and always
 * shows its "Green belt" text label, so the two greens are never confused and colour is never the only
 * signal. The BLUE BELT stays blue; it is not part of the brand recolour.
 */

export type BeltKey = "red" | "yellow" | "blue" | "green";

export type Belt = {
  key: BeltKey;
  /** Human label, always shown next to the colour (never rely on colour alone). */
  name: string;
  /** Inclusive lower bound of entries-this-week for this belt. */
  min: number;
  /** Tailwind classes for the coloured badge/pill. */
  chip: string;
  /** Tailwind classes for the small colour dot inside the badge. */
  dot: string;
  /** Subtle background tint, for grouping or highlighting a belt. */
  tint: string;
};

/** Belts from lowest to highest. */
export const BELTS: Belt[] = [
  { key: "red", name: "Red belt", min: 0, chip: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200", dot: "bg-red-500", tint: "bg-red-50" },
  { key: "yellow", name: "Yellow belt", min: 200, chip: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200", dot: "bg-amber-400", tint: "bg-amber-50" },
  { key: "blue", name: "Blue belt", min: 350, chip: "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200", dot: "bg-blue-500", tint: "bg-blue-50" },
  { key: "green", name: "Green belt", min: 501, chip: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200", dot: "bg-emerald-500", tint: "bg-emerald-50" },
];

/** The belt for a number of entries this week: the highest belt whose minimum is met. */
export function beltFor(weekEntries: number): Belt {
  let belt = BELTS[0];
  for (const b of BELTS) if (weekEntries >= b.min) belt = b;
  return belt;
}

/** The next belt up and how many more entries this week would reach it, or null at the top belt (green). */
export function nextBelt(weekEntries: number): { belt: Belt; needed: number } | null {
  const current = beltFor(weekEntries);
  const i = BELTS.findIndex((b) => b.key === current.key);
  const next = BELTS[i + 1];
  return next ? { belt: next, needed: Math.max(1, next.min - weekEntries) } : null;
}
