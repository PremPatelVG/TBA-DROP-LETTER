import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { addDays, applyWeek, EMPTY_STATE, localDate, previousWeek, weeksToApply, type Level, type LevelState, type Week } from "./rules";

export type WeeklySummary = {
  week: Week;
  advisors: number;
  applied: number;
  upToDate: number;
  skipped: number;
  promoted: string[];
  demoted: string[];
};

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : typeof v === "string" ? new Date(v) : new Date(0));

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
 * The weekly level check. For every active advisor, applies each finished week not applied yet (normally just
 * the previous competition week, Sunday noon to Sunday noon) inside a transaction that also records
 * weekly_results/{advisor}_{sunday} and, on a change, level_history/weekly_{advisor}_{sunday}. A week already
 * applied is skipped, so running the job again for the same week changes nothing.
 */
export async function runWeeklyLevels(db: Firestore, at: Date): Promise<WeeklySummary> {
  const week = previousWeek(at);
  const levels: Level[] = (await db.collection("levels").get()).docs.map((d) => ({
    id: Number(d.id), name: d.get("name"), target_letters: d.get("target_letters"), sort_order: d.get("sort_order"),
  }));
  if (!levels.length) throw new Error("No target levels found. Run scripts/create-master.mjs first.");

  const advisors = await db.collection("users").where("role", "==", "advisor").get();
  const summary: WeeklySummary = { week, advisors: advisors.size, applied: 0, upToDate: 0, skipped: 0, promoted: [], demoted: [] };

  for (const advisor of advisors.docs) {
    const a = advisor.data();
    if (a.active !== true || typeof a.level_id !== "number") {
      summary.skipped++;
      continue;
    }
    const state: LevelState = { ...EMPTY_STATE, ...(a.level_state ?? {}) };
    const weeks = weeksToApply(state.last_week, localDate(toDate(a.created_at)), week.start);
    if (!weeks.length) summary.upToDate++;
    for (const start of weeks) {
      const w = { start, end: addDays(start, 6) };
      const letters = await countLetters(db, advisor.id, w);
      const outcome = await db.runTransaction(async (tx) => {
        const userRef = db.collection("users").doc(advisor.id);
        const resultRef = db.collection("weekly_results").doc(`${advisor.id}_${start}`);
        const [fresh, done] = await Promise.all([tx.get(userRef), tx.get(resultRef)]);
        const u = fresh.data();
        const s: LevelState = { ...EMPTY_STATE, ...(u?.level_state ?? {}) };
        if (!u || done.exists || (s.last_week && s.last_week >= start)) return null; // applied before
        const r = applyWeek(levels, u.level_id, s, w, letters);
        tx.create(resultRef, {
          advisor_id: advisor.id, week_start: w.start, week_end: w.end, letters, target: r.target, met: r.met,
          level_id: r.from_level_id, new_level_id: r.to_level_id, change: r.change, applied_at: FieldValue.serverTimestamp(),
        });
        tx.update(userRef, r.change ? { level_state: r.state, level_id: r.to_level_id } : { level_state: r.state });
        if (r.change) {
          tx.create(db.collection("level_history").doc(`weekly_${advisor.id}_${start}`), {
            advisor_id: advisor.id, from_level_id: r.from_level_id, to_level_id: r.to_level_id, changed_by: "weekly-job",
            reason: r.reason, source: "weekly", week_start: w.start, changed_at: FieldValue.serverTimestamp(),
          });
        }
        return r;
      });
      if (!outcome) {
        summary.upToDate++;
        continue;
      }
      summary.applied++;
      if (outcome.change === "promoted") summary.promoted.push(`${a.advisor_code} (${w.start})`);
      if (outcome.change === "demoted") summary.demoted.push(`${a.advisor_code} (${w.start})`);
    }
  }
  return summary;
}
