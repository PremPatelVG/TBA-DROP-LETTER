// Runs the weekly belt snapshot against the Firestore emulator (skipped without it):
//   firebase emulators:exec --only firestore "npm --prefix functions test"
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { addDays } from "./week";
import { beltFor, runWeeklySnapshot } from "./snapshot";

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT || "demo-tba";
const skip = !EMULATOR && "set FIRESTORE_EMULATOR_HOST (run under the Firestore emulator)";

// Monday 28 Sept 2026, 09:00 IST (= 03:30 UTC): the job snapshots the week Mon 21 - Sun 27 Sept.
const RUN_AT = new Date("2026-09-28T03:30:00Z");

let app: App;
let db: Firestore;

async function clear() {
  await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
}

/** Adds `count` drops for `advisorId`, dated across the Mon..Sun of the week that starts on `monday`. */
async function addDrops(advisorId: string, monday: string, count: number) {
  for (let base = 0; base < count; base += 450) {
    const batch = db.batch(); // Firestore batches take at most 500 writes
    for (let i = base; i < Math.min(base + 450, count); i++) {
      const day = addDays(monday, i % 7); // Monday..Sunday
      batch.set(db.collection("drops").doc(), {
        advisor_id: advisorId, drop_date: day, created_at: Timestamp.fromDate(new Date(`${day}T10:00:00+05:30`)),
        office_number: String(100 + i), company_name: "Test Co", building_name: "Test Tower", block_no: "A",
        area: null, city: null, full_address: null, responded: false, response_type: "none", response_date: null,
        response_notes: null, response_phone: null, response_email: null, search_tokens: [],
      });
    }
    await batch.commit();
  }
}

before(async () => {
  if (skip) return;
  app = initializeApp({ projectId: PROJECT }, "snapshot-test");
  db = getFirestore(app);
  await clear();
  const advisor = (code: string, extra: object = {}) => ({
    role: "advisor", full_name: code, email: `${code.toLowerCase()}@example.com`, advisor_code: code, region: "Test",
    active: true, uid: null, created_at: Timestamp.fromDate(new Date("2026-08-01T12:00:00+05:30")), ...extra,
  });
  await Promise.all([
    db.doc("users/a").set(advisor("A")), // green (520 entries in the ended week)
    db.doc("users/b").set(advisor("B")), // yellow (240 entries)
    db.doc("users/c").set(advisor("C")), // red (no entries)
    db.doc("users/d").set(advisor("D", { active: false })), // deactivated: skipped
    db.doc("users/ops").set({ role: "operations", full_name: "Ops", email: "ops@example.com", active: true }),
  ]);
  await addDrops("a", "2026-09-21", 520); // the ended week
  await addDrops("b", "2026-09-21", 240);
  await addDrops("a", "2026-09-28", 50); // the current week: must not be counted
  await addDrops("d", "2026-09-21", 10); // deactivated: no snapshot regardless
});

after(async () => {
  if (app) await deleteApp(app);
});

test("belt thresholds match src/lib/belts.ts", { skip }, () => {
  assert.equal(beltFor(0), "red");
  assert.equal(beltFor(199), "red");
  assert.equal(beltFor(200), "yellow");
  assert.equal(beltFor(349), "yellow");
  assert.equal(beltFor(350), "blue");
  assert.equal(beltFor(500), "blue");
  assert.equal(beltFor(501), "green");
});

test("snapshots the ended week's belt standing for every active advisor", { skip }, async () => {
  const s = await runWeeklySnapshot(db, RUN_AT);
  assert.deepEqual(s.week, { start: "2026-09-21", end: "2026-09-27" });
  assert.equal(s.written, 3, "A, B and C (not the deactivated D)");

  const a = (await db.doc("weekly_results/a_2026-09-21").get()).data()!;
  assert.equal(a.letters, 520, "entries dated in the ended week only (not the current week)");
  assert.equal(a.belt, "green");
  assert.equal(a.week_start, "2026-09-21");
  assert.equal(a.week_end, "2026-09-27");
  const b = (await db.doc("weekly_results/b_2026-09-21").get()).data()!;
  assert.equal(b.letters, 240);
  assert.equal(b.belt, "yellow");
  const c = (await db.doc("weekly_results/c_2026-09-21").get()).data()!;
  assert.equal(c.letters, 0);
  assert.equal(c.belt, "red");
  assert.equal((await db.doc("weekly_results/d_2026-09-21").get()).exists, false, "deactivated advisor is skipped");
});

test("running again for the same week changes nothing", { skip }, async () => {
  const at = (await db.doc("weekly_results/a_2026-09-21").get()).updateTime!.toMillis();
  const s = await runWeeklySnapshot(db, RUN_AT);
  assert.equal(s.written, 0);
  const again = (await db.doc("weekly_results/a_2026-09-21").get()).updateTime!.toMillis();
  assert.equal(again, at, "the record was not rewritten");
});
