/**
 * Belt ranking for advisors, based on the number of drop entries in the current competition week
 * (entries this week; see currentWeek() in src/lib/stats.ts — the week runs Monday 09:00 to the
 * following Monday 09:00, IST). One drop entry is one letter.
 *
 * The TIER names and colours are fixed here; the three numeric BOUNDARIES are DATA, not constants:
 * they are stored (Firestore `settings/belts`, mirrored in the mock data layer), seeded with
 * {@link DEFAULT_BELT_THRESHOLDS}, and editable by the master. Every belt computation — the leaderboard
 * UI, any belt display and the weekly snapshot Cloud Function — reads the stored thresholds and calls the
 * pure {@link classify} function, so moving a boundary (e.g. Red's ceiling 200 -> 250) takes effect
 * everywhere at once.
 *
 * Default thresholds (entries this week):
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

/** A belt tier: its name and colours only (no numeric boundary — those live in {@link BeltThresholds}). */
export type BeltTier = {
  key: BeltKey;
  /** Human label, always shown next to the colour (never rely on colour alone). */
  name: string;
  /** Tailwind classes for the coloured badge/pill. */
  chip: string;
  /** Tailwind classes for the small colour dot inside the badge. */
  dot: string;
  /** Subtle background tint, for grouping or highlighting a belt. */
  tint: string;
};

/** Belt tiers from lowest to highest. Names and colours are fixed; the boundaries are stored separately. */
export const BELT_TIERS: BeltTier[] = [
  { key: "red", name: "Red belt", chip: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200", dot: "bg-red-500", tint: "bg-red-50" },
  { key: "yellow", name: "Yellow belt", chip: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200", dot: "bg-amber-400", tint: "bg-amber-50" },
  { key: "blue", name: "Blue belt", chip: "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200", dot: "bg-blue-500", tint: "bg-blue-50" },
  { key: "green", name: "Green belt", chip: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200", dot: "bg-emerald-500", tint: "bg-emerald-50" },
];

/**
 * The three belt boundaries (inclusive lower bounds of entries this week). Red is everything below `yellowMin`.
 * Stored as data and editable by the master; {@link beltThresholdsError} validates an edit.
 */
export type BeltThresholds = { yellowMin: number; blueMin: number; greenMin: number };

/** The current defaults — behaviour is unchanged until the master edits the stored thresholds. */
export const DEFAULT_BELT_THRESHOLDS: BeltThresholds = { yellowMin: 200, blueMin: 350, greenMin: 501 };

/** A belt tier resolved against a set of thresholds: the tier plus its inclusive lower bound. */
export type Belt = BeltTier & { min: number };

/** Inclusive lower bound of `key` for the given thresholds (Red is always 0). */
function tierMin(key: BeltKey, t: BeltThresholds): number {
  return key === "green" ? t.greenMin : key === "blue" ? t.blueMin : key === "yellow" ? t.yellowMin : 0;
}

/**
 * Checks thresholds being set: each a positive whole number, and strictly increasing
 * (yellowMin < blueMin < greenMin). Returns a message for the first problem, or null when valid.
 */
export function beltThresholdsError(t: BeltThresholds): string | null {
  const fields: [string, number][] = [["Yellow start", t.yellowMin], ["Blue start", t.blueMin], ["Green start", t.greenMin]];
  for (const [label, v] of fields) {
    if (!Number.isInteger(v) || v <= 0) return `${label} must be a whole number greater than 0.`;
  }
  if (!(t.yellowMin < t.blueMin && t.blueMin < t.greenMin)) {
    return "Boundaries must increase: Yellow start < Blue start < Green start.";
  }
  return null;
}

/** The belt for a number of entries this week, given thresholds: the highest tier whose minimum is met. Pure. */
export function classify(weekEntries: number, t: BeltThresholds): Belt {
  let belt: Belt = { ...BELT_TIERS[0], min: 0 };
  for (const tier of BELT_TIERS) {
    const min = tierMin(tier.key, t);
    if (weekEntries >= min) belt = { ...tier, min };
  }
  return belt;
}

/** The next belt up and how many more entries this week would reach it, or null at the top belt (green). */
export function nextBelt(weekEntries: number, t: BeltThresholds): { belt: Belt; needed: number } | null {
  const current = classify(weekEntries, t);
  const i = BELT_TIERS.findIndex((b) => b.key === current.key);
  const tier = BELT_TIERS[i + 1];
  if (!tier) return null;
  const min = tierMin(tier.key, t);
  return { belt: { ...tier, min }, needed: Math.max(1, min - weekEntries) };
}
