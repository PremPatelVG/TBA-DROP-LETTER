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
 * Belt thresholds by entries in the competition week. Fixed constants — must match src/lib/belts.ts
 * (red < 200, yellow 200-349, blue 350-500, green 501+). Belts are the only ranking; there are no levels.
 */
export type BeltKey = "red" | "yellow" | "blue" | "green";
const BELTS: { key: BeltKey; min: number }[] = [
  { key: "red", min: 0 },
  { key: "yellow", min: 200 },
  { key: "blue", min: 350 },
  { key: "green", min: 501 },
];

/** The belt for a weekly entry count: the highest belt whose minimum is met. */
export function beltFor(weekEntries: number): BeltKey {
  let key: BeltKey = BELTS[0].key;
  for (const b of BELTS) if (weekEntries >= b.min) key = b.key;
  return key;
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
  const advisors = await db.collection("users").where("role", "==", "advisor").get();
  const summary: SnapshotSummary = { week, advisors: advisors.size, written: 0, skipped: 0 };

  for (const advisor of advisors.docs) {
    const a = advisor.data();
    if (a.active !== true) {
      summary.skipped++;
      continue;
    }
    const letters = await countLetters(db, advisor.id, week);
    const belt = beltFor(letters);
    const wrote = await db.runTransaction(async (tx) => {
      const ref = db.collection("weekly_results").doc(`${advisor.id}_${week.start}`);
      if ((await tx.get(ref)).exists) return false; // already recorded for this week
      tx.create(ref, {
        advisor_id: advisor.id,
        advisor_code: a.advisor_code ?? null,
        full_name: a.full_name ?? null,
        region: a.region ?? null,
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
