import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { previousWeek, type Week } from "./week";

export type SnapshotSummary = {
  week: Week;
  advisors: number;
  /** New weekly_results records written this run. */
  written: number;
  /** Advisors left out: deactivated, or already recorded for this week. */
  skipped: number;
};

/**
 * Belt thresholds by entries in the competition week. These are DATA, not constants: the master edits them and
 * they are stored in Firestore `settings/belts` (see firestore.rules and src/lib/belts.ts). The snapshot reads
 * them with {@link readBeltThresholds} and classifies with {@link beltFor}, so a moved boundary takes effect here
 * too. {@link DEFAULT_BELT_THRESHOLDS} (red < 200, yellow 200-349, blue 350-500, green 501+) is used only when no
 * settings document exists yet, matching src/lib/belts.ts. Belts are the only ranking; there are no levels.
 */
export type BeltKey = "red" | "yellow" | "blue" | "green";
export type BeltThresholds = { yellowMin: number; blueMin: number; greenMin: number };
export const DEFAULT_BELT_THRESHOLDS: BeltThresholds = { yellowMin: 200, blueMin: 350, greenMin: 501 };

/** The belt for a weekly entry count, given thresholds: the highest belt whose minimum is met. */
export function beltFor(weekEntries: number, t: BeltThresholds): BeltKey {
  if (weekEntries >= t.greenMin) return "green";
  if (weekEntries >= t.blueMin) return "blue";
  if (weekEntries >= t.yellowMin) return "yellow";
  return "red";
}

/** Reads the stored belt thresholds (settings/belts), or the defaults when none are stored yet. */
export async function readBeltThresholds(db: Firestore): Promise<BeltThresholds> {
  const d = (await db.collection("settings").doc("belts").get()).data();
  if (d && typeof d.yellowMin === "number" && typeof d.blueMin === "number" && typeof d.greenMin === "number") {
    return { yellowMin: d.yellowMin, blueMin: d.blueMin, greenMin: d.greenMin };
  }
  return DEFAULT_BELT_THRESHOLDS;
}

/** Letters (= entries) one advisor dropped in a week. A count query: about one read per 1,000 entries. */
export async function countLetters(db: Firestore, advisorId: string, week: Week) {
  const q = db.collection("drops")
    .where("advisor_id", "==", advisorId)
    .where("drop_date", ">=", week.start)
    .where("drop_date", "<=", week.end)
    .orderBy("drop_date", "desc") // same shape as the app's queries, so it uses the same index
    .orderBy("created_at", "desc");
  return (await q.count().get()).data().count;
}

/**
 * The weekly belt snapshot. On each Monday 09:00 IST run it records the final belt standing of every active
 * advisor for the competition week that just ended (Monday 09:00 to Monday 09:00) into
 * weekly_results/{advisor}_{monday}, keyed by that week's Monday date. The record is created only when it does
 * not already exist, so re-running the job for the same week changes nothing. Uses the scheduled time, not the
 * clock, so a retry or a late start still snapshots the same week. There is no promotion, demotion or
 * level_history: belts are the sole ranking.
 */
export async function runWeeklySnapshot(db: Firestore, at: Date): Promise<SnapshotSummary> {
  const week = previousWeek(at);
  // The master-editable thresholds, read once for the whole run (see src/lib/belts.ts / settings/belts).
  const thresholds = await readBeltThresholds(db);
  const advisors = await db.collection("users").where("role", "==", "advisor").get();
  const summary: SnapshotSummary = { week, advisors: advisors.size, written: 0, skipped: 0 };

  for (const advisor of advisors.docs) {
    const a = advisor.data();
    if (a.active !== true) {
      summary.skipped++;
      continue;
    }
    const letters = await countLetters(db, advisor.id, week);
    const belt = beltFor(letters, thresholds);
    const wrote = await db.runTransaction(async (tx) => {
      const ref = db.collection("weekly_results").doc(`${advisor.id}_${week.start}`);
      if ((await tx.get(ref)).exists) return false; // already recorded for this week
      tx.create(ref, {
        advisor_id: advisor.id,
        advisor_code: a.advisor_code ?? null,
        full_name: a.full_name ?? null,
        city: a.city ?? null,
        state: a.state ?? null,
        week_start: week.start,
        week_end: week.end,
        letters,
        belt,
        recorded_at: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (wrote) summary.written++;
    else summary.skipped++;
  }
  return summary;
}
