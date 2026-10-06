// Runs the weekly job against the Firestore emulator (skipped without it):
//   firebase emulators:exec --only firestore "npm --prefix functions test"
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { addDays } from "./rules";
import { runWeeklyLevels } from "./weekly";

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT || "demo-tba";
const skip = !EMULATOR && "set FIRESTORE_EMULATOR_HOST (run under the Firestore emulator)";

// Sunday 27 Sept 2026, 12:00 noon India time: the job checks the week Sun 20 - Sat 26 Sept.
const RUN_AT = new Date("2026-09-27T06:30:00Z");
const NEXT_RUN_AT = new Date("2026-10-04T06:30:00Z");

let app: App;
let db: Firestore;

async function clear() {
  await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

/** `perWeek`: letters per week, keyed by the week's Sunday. */
async function addDrops(advisorId: string, perWeek: Record<string, number>) {
  const batch = db.batch();
  for (const [sunday, n] of Object.entries(perWeek)) {
    for (let i = 0; i < n; i++) {
      const day = addDays(sunday, i % 7);
      batch.set(db.collection("drops").doc(), {
        advisor_id: advisorId, drop_date: day, created_at: Timestamp.fromDate(new Date(`${day}T10:00:00+05:30`)),
        office_number: String(100 + i), company_name: "Test Co", building_name: "Test Tower", block_no: "A",
        area: null, city: null, full_address: null, responded: false, response_type: "none", response_date: null,
        response_notes: null, response_phone: null, response_email: null, search_tokens: [],
      });
    }
  }
  await batch.commit();
}

async function snapshot() {
  const out: Record<string, string> = {};
  for (const c of ["users", "level_history", "weekly_results"]) {
    for (const d of (await db.collection(c).get()).docs) out[`${c}/${d.id}`] = `${d.updateTime.toMillis()} ${JSON.stringify(d.data())}`;
  }
  return out;
}

before(async () => {
  if (skip) return;
  app = initializeApp({ projectId: PROJECT }, "weekly-test");
  db = getFirestore(app);
  await clear();
  // Small targets keep the test quick; the job reads whatever the levels say.
  await Promise.all([
    db.doc("levels/1").set({ name: "Level 1", target_letters: 5, sort_order: 1 }),
    db.doc("levels/2").set({ name: "Level 2", target_letters: 10, sort_order: 2 }),
    db.doc("levels/3").set({ name: "Level 3", target_letters: 15, sort_order: 3 }),
  ]);
  const advisor = (code: string, level: number, added: string, extra: object = {}) => ({
    role: "advisor", full_name: code, email: `${code.toLowerCase()}@example.com`, advisor_code: code, region: "Test",
    level_id: level, active: true, uid: null, created_at: Timestamp.fromDate(new Date(`${added}T12:00:00+05:30`)), ...extra,
  });
  await Promise.all([
    // Met the Level 1 target (5) in the last 4 weeks: promoted.
    db.doc("users/a").set(advisor("A", 1, "2026-08-01")),
    // Level 2 (10): met, then missed twice: demoted.
    db.doc("users/b").set(advisor("B", 2, "2026-09-01")),
    // Deactivated: left alone.
    db.doc("users/c").set(advisor("C", 1, "2026-08-01", { active: false })),
    // Level 1, missing every week: stays at Level 1.
    db.doc("users/d").set(advisor("D", 1, "2026-09-13")),
    db.doc("users/ops").set({ role: "operations", full_name: "Ops", email: "ops@example.com", active: true }),
  ]);
  await addDrops("a", { "2026-08-30": 5, "2026-09-06": 6, "2026-09-13": 9, "2026-09-20": 5, "2026-09-27": 3 });
  await addDrops("b", { "2026-09-06": 12, "2026-09-13": 9, "2026-09-20": 2 });
  await addDrops("c", { "2026-09-20": 50 });
  await addDrops("d", { "2026-09-20": 4 });
});

after(async () => {
  if (app) await deleteApp(app);
});

test("applies the level rules for the week that just ended", { skip }, async () => {
  const s = await runWeeklyLevels(db, RUN_AT);
  assert.deepEqual(s.week, { start: "2026-09-20", end: "2026-09-26" });
  assert.deepEqual(s.promoted, ["A (2026-09-20)"]);
  assert.deepEqual(s.demoted, ["B (2026-09-20)"]);
  assert.equal(s.skipped, 1, "the deactivated advisor");

  const a = (await db.doc("users/a").get()).data()!;
  const b = (await db.doc("users/b").get()).data()!;
  const c = (await db.doc("users/c").get()).data()!;
  const d = (await db.doc("users/d").get()).data()!;
  assert.equal(a.level_id, 2);
  assert.deepEqual(a.level_state, { met_streak: 0, miss_streak: 0, last_week: "2026-09-20" });
  assert.equal(b.level_id, 1);
  assert.equal(c.level_id, 1);
  assert.equal(c.level_state, undefined);
  assert.equal(d.level_id, 1, "never below the lowest level");
  assert.deepEqual(d.level_state, { met_streak: 0, miss_streak: 2, last_week: "2026-09-20" });

  const history = (await db.collection("level_history").get()).docs.map((x) => ({ id: x.id, ...x.data() }));
  assert.equal(history.length, 2);
  const promo = history.find((h) => h.id === "weekly_a_2026-09-20") as Record<string, unknown>;
  assert.equal(promo.from_level_id, 1);
  assert.equal(promo.to_level_id, 2);
  assert.equal(promo.changed_by, "weekly-job");
  assert.match(String(promo.reason), /4 weeks in a row/);
  const demo = history.find((h) => h.id === "weekly_b_2026-09-20") as Record<string, unknown>;
  assert.equal(demo.from_level_id, 2);
  assert.equal(demo.to_level_id, 1);

  // A was added on 1 Aug: the 8 weeks from 2 Aug are recorded (at most 8 on the first run).
  const results = await db.collection("weekly_results").where("advisor_id", "==", "a").get();
  assert.equal(results.size, 8);
  const last = (await db.doc("weekly_results/a_2026-09-20").get()).data()!;
  assert.equal(last.letters, 5, "entries dated in the week (Sun-Sat) only");
  assert.equal(last.met, true);
});

test("running again for the same week changes nothing", { skip }, async () => {
  const before = await snapshot();
  const s = await runWeeklyLevels(db, RUN_AT);
  assert.equal(s.applied, 0);
  assert.deepEqual(s.promoted, []);
  assert.deepEqual(s.demoted, []);
  assert.deepEqual(await snapshot(), before);
});

test("the next week continues from the stored streaks", { skip }, async () => {
  const s = await runWeeklyLevels(db, NEXT_RUN_AT);
  assert.deepEqual(s.week, { start: "2026-09-27", end: "2026-10-03" });
  const a = (await db.doc("users/a").get()).data()!;
  // A is now at Level 2 (target 10) and dropped 3 letters: one miss, no change yet.
  assert.equal(a.level_id, 2);
  assert.deepEqual(a.level_state, { met_streak: 0, miss_streak: 1, last_week: "2026-09-27" });
});
