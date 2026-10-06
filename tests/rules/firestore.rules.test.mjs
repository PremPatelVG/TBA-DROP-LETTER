// Security rules tests. Run: npm run test:rules (starts the Firestore emulator).
import { after, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from "firebase/firestore";

let env;

const person = (role, uid, extra = {}) => ({ role, uid, active: true, full_name: role, email: `${uid}@example.com`, ...extra });
const drop = (advisorId, extra = {}) => ({
  advisor_id: advisorId, office_number: "301-302", company_name: "Vasant Group", building_name: "Shivalik Shilp", block_no: "A",
  area: null, city: "Ahmedabad", full_address: null, drop_date: "2026-09-28", responded: false, response_type: "none",
  response_date: null, response_notes: null, response_phone: null, response_email: null,
  created_at: Timestamp.fromDate(new Date("2026-09-28T10:00:00+05:30")), search_tokens: ["3", "30", "301", "vasant", "b:shivalik-shilp"],
  ...extra,
});
const responded = (extra = {}) => ({ responded: true, response_type: "call", response_date: "2026-09-29", response_notes: "Called back", ...extra });
const lead = (advisorId, extra = {}) => ({
  advisor_id: advisorId, contact_name: "Mr. Patel", company_name: null, phone: "+91 98765 43210", email: null, notes: null,
  lead_date: "2026-09-29", drop_id: null, created_at: Timestamp.now(), ...extra,
});

// Signed-in people. Claims are what the server sets: { role, pid } (pid = access-list document id).
const as = {
  anon: () => env.unauthenticatedContext().firestore(),
  unlisted: () => env.authenticatedContext("uid-visitor", { email: "visitor@gmail.com", firebase: { sign_in_provider: "google.com" } }).firestore(),
  adv1: () => env.authenticatedContext("uid-adv1", { role: "advisor", pid: "adv1" }).firestore(),
  adv2: () => env.authenticatedContext("uid-adv2", { role: "advisor", pid: "adv2" }).firestore(),
  ops: () => env.authenticatedContext("uid-ops", { role: "operations", pid: "ops" }).firestore(),
  master: () => env.authenticatedContext("uid-master", { role: "master", pid: "master" }).firestore(),
  deactivated: () => env.authenticatedContext("uid-gone", { role: "advisor", pid: "gone" }).firestore(),
  // Claims naming someone else's entry, or a role the entry does not have.
  otherUid: () => env.authenticatedContext("uid-intruder", { role: "advisor", pid: "adv1" }).firestore(),
  wrongRole: () => env.authenticatedContext("uid-ops", { role: "master", pid: "ops" }).firestore(),
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-tba-rules",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") },
  });
});
after(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, "users/master"), person("master", "uid-master")),
      setDoc(doc(db, "users/ops"), person("operations", "uid-ops")),
      setDoc(doc(db, "users/adv1"), person("advisor", "uid-adv1", { advisor_code: "ADV001", level_id: 1 })),
      setDoc(doc(db, "users/adv2"), person("advisor", "uid-adv2", { advisor_code: "ADV002", level_id: 2 })),
      setDoc(doc(db, "users/gone"), person("advisor", "uid-gone", { advisor_code: "ADV009", level_id: 1, active: false })),
      setDoc(doc(db, "levels/1"), { name: "Level 1", target_letters: 200, sort_order: 1 }),
      setDoc(doc(db, "levels/2"), { name: "Level 2", target_letters: 350, sort_order: 2 }),
      setDoc(doc(db, "drops/d1"), drop("adv1")),
      setDoc(doc(db, "drops/d2"), drop("adv2")),
      setDoc(doc(db, "drops/dgone"), drop("gone")),
      setDoc(doc(db, "direct_leads/l1"), lead("adv1")),
      setDoc(doc(db, "direct_leads/l2"), lead("adv2")),
      setDoc(doc(db, "buildings/adv1__shivalik-shilp"), { advisor_id: "adv1", key: "shivalik-shilp", name: "Shivalik Shilp" }),
      setDoc(doc(db, "level_history/h1"), { advisor_id: "adv1", from_level_id: 1, to_level_id: 2, changed_by: "weekly-job", changed_at: Timestamp.now() }),
      setDoc(doc(db, "level_history/h2"), { advisor_id: "adv2", from_level_id: 2, to_level_id: 1, changed_by: "ops", changed_at: Timestamp.now() }),
      setDoc(doc(db, "weekly_results/adv1_2026-09-21"), { advisor_id: "adv1", letters: 210 }),
    ]);
  });
});

describe("people who are not allowed in", () => {
  for (const who of ["anon", "unlisted", "deactivated", "otherUid"]) {
    test(`${who}: cannot read or write anything`, async () => {
      const db = as[who]();
      await assertFails(getDoc(doc(db, "users/adv1")));
      await assertFails(getDoc(doc(db, "users/gone")));
      await assertFails(getDoc(doc(db, "drops/d1")));
      await assertFails(getDoc(doc(db, "drops/dgone")));
      await assertFails(getDocs(query(collection(db, "drops"), where("advisor_id", "==", "adv1"))));
      await assertFails(getDocs(collection(db, "levels")));
      await assertFails(getDocs(collection(db, "direct_leads")));
      await assertFails(setDoc(doc(db, "drops/new"), drop("adv1")));
      await assertFails(setDoc(doc(db, "drops/new2"), drop("gone")));
      await assertFails(setDoc(doc(db, "direct_leads/new"), lead("adv1")));
      await assertFails(updateDoc(doc(db, "levels/1"), { target_letters: 1 }));
      await assertFails(setDoc(doc(db, "users/me"), person("master", "uid-visitor")));
    });
  }
  test("claims must match the access entry's role", async () => {
    await assertFails(getDocs(query(collection(as.wrongRole(), "users"), where("role", "==", "operations"))));
    await assertFails(getDoc(doc(as.wrongRole(), "drops/d1")));
  });
});

describe("advisors: own drops only", () => {
  test("create their own drops, not someone else's", async () => {
    await assertSucceeds(setDoc(doc(as.adv1(), "drops/new"), drop("adv1")));
    await assertFails(setDoc(doc(as.adv1(), "drops/other"), drop("adv2")));
  });
  test("read only their own drops, and must ask for their own", async () => {
    const db = as.adv1();
    await assertSucceeds(getDoc(doc(db, "drops/d1")));
    await assertFails(getDoc(doc(db, "drops/d2")));
    await assertSucceeds(getDocs(query(collection(db, "drops"), where("advisor_id", "==", "adv1"), orderBy("drop_date", "desc"))));
    await assertFails(getDocs(query(collection(db, "drops"), orderBy("drop_date", "desc"))));
    await assertFails(getDocs(query(collection(db, "drops"), where("advisor_id", "==", "adv2"))));
    await assertSucceeds(getCountFromServer(query(collection(db, "drops"), where("advisor_id", "==", "adv1"))));
    await assertFails(getCountFromServer(collection(db, "drops")));
  });
  test("update their own drops but not the owner, and never delete", async () => {
    const db = as.adv1();
    await assertSucceeds(updateDoc(doc(db, "drops/d1"), responded({ response_phone: "98765 43210" })));
    await assertFails(updateDoc(doc(db, "drops/d2"), responded({ response_phone: "98765 43210" })));
    await assertFails(updateDoc(doc(db, "drops/d1"), { advisor_id: "adv2" }));
    await assertFails(updateDoc(doc(db, "drops/d1"), { created_at: Timestamp.now() }));
    await assertFails(deleteDoc(doc(db, "drops/d1")));
  });
});

describe("drop fields", () => {
  const create = (fields) => setDoc(doc(as.adv1(), "drops/x"), fields);
  test("office number, company, building and block are required", async () => {
    for (const k of ["office_number", "company_name", "building_name", "block_no"]) {
      const d = drop("adv1");
      delete d[k];
      await assertFails(create(d));
      await assertFails(create(drop("adv1", { [k]: "   " })));
    }
    await assertSucceeds(create(drop("adv1", { area: null, city: null, full_address: null })));
  });
  test("dates, types and unknown fields are checked", async () => {
    await assertFails(create(drop("adv1", { drop_date: "28/09/2026" })));
    await assertFails(create(drop("adv1", { created_at: "2026-09-28" })));
    await assertFails(create(drop("adv1", { search_tokens: "vasant" })));
    await assertFails(create(drop("adv1", { letters: 5 })));
  });
  test("a responded letter needs the responder's phone or email", async () => {
    await assertFails(create(drop("adv1", responded())));
    await assertFails(create(drop("adv1", responded({ response_phone: "  ", response_email: null }))));
    await assertSucceeds(create(drop("adv1", responded({ response_phone: "+91 98765 43210" }))));
    await assertSucceeds(create(drop("adv1", responded({ response_email: "info@vasantgroup.in" }))));
    await assertSucceeds(create(drop("adv1", responded({ response_phone: "98765-43210", response_email: "a@b.co" }))));
    await assertFails(create(drop("adv1", responded({ response_phone: "12345" }))));
    await assertFails(create(drop("adv1", responded({ response_email: "not an email" }))));
    await assertFails(create(drop("adv1", responded({ response_phone: "9876543210", response_date: "2026-09-01" }))), "before the drop date");
    await assertFails(create(drop("adv1", responded({ response_phone: "9876543210", response_type: "none" }))));
    await assertFails(create(drop("adv1", { response_phone: "9876543210" })), "contact without a response");
  });
});

describe("direct leads", () => {
  test("advisors create, read and update only their own", async () => {
    const db = as.adv1();
    await assertSucceeds(setDoc(doc(db, "direct_leads/new"), lead("adv1")));
    await assertSucceeds(setDoc(doc(db, "direct_leads/linked"), lead("adv1", { drop_id: "d1" })));
    await assertFails(setDoc(doc(db, "direct_leads/theirs"), lead("adv2")));
    await assertFails(setDoc(doc(db, "direct_leads/bad-link"), lead("adv1", { drop_id: "d2" })), "linked to another advisor's letter");
    await assertFails(setDoc(doc(db, "direct_leads/no-contact"), lead("adv1", { phone: null, email: null })));
    await assertSucceeds(getDocs(query(collection(db, "direct_leads"), where("advisor_id", "==", "adv1"))));
    await assertFails(getDoc(doc(db, "direct_leads/l2")));
    await assertSucceeds(updateDoc(doc(db, "direct_leads/l1"), { notes: "Meeting on Saturday" }));
    await assertFails(updateDoc(doc(db, "direct_leads/l1"), { advisor_id: "adv2" }));
    await assertFails(updateDoc(doc(db, "direct_leads/l2"), { notes: "x" }));
  });
});

describe("operations and master", () => {
  for (const who of ["ops", "master"]) {
    test(`${who}: read everything, but do not write drops or leads`, async () => {
      const db = as[who]();
      await assertSucceeds(getDocs(query(collection(db, "drops"), orderBy("drop_date", "desc"))));
      await assertSucceeds(getDoc(doc(db, "drops/d2")));
      await assertSucceeds(getCountFromServer(query(collection(db, "drops"), where("responded", "==", true))));
      await assertSucceeds(getDocs(collection(db, "direct_leads")));
      await assertSucceeds(getDocs(collection(db, "buildings")));
      await assertSucceeds(getDocs(collection(db, "level_history")));
      await assertSucceeds(getDocs(collection(db, "weekly_results")));
      await assertSucceeds(getDocs(query(collection(db, "users"), where("role", "==", "advisor"))));
      await assertFails(setDoc(doc(db, "drops/new"), drop("adv1")));
      await assertFails(updateDoc(doc(db, "drops/d1"), responded({ response_phone: "9876543210" })));
      await assertFails(setDoc(doc(db, "direct_leads/new"), lead("adv1")));
    });
  }
  test("only master sees operations accounts", async () => {
    await assertSucceeds(getDocs(query(collection(as.master(), "users"), where("role", "==", "operations"))));
    await assertFails(getDocs(query(collection(as.ops(), "users"), where("role", "==", "operations"))));
    await assertFails(getDocs(collection(as.ops(), "users")));
    await assertFails(getDoc(doc(as.ops(), "users/master")));
    await assertSucceeds(getDoc(doc(as.ops(), "users/ops")), "their own entry");
  });
  test("advisors read their own entry only", async () => {
    await assertSucceeds(getDoc(doc(as.adv1(), "users/adv1")));
    await assertFails(getDoc(doc(as.adv1(), "users/adv2")));
    await assertFails(getDocs(query(collection(as.adv1(), "users"), where("role", "==", "advisor"))));
  });
});

describe("the access list, level history and weekly results are server-only", () => {
  test("nobody writes them from the app", async () => {
    await assertFails(setDoc(doc(as.master(), "users/new-ops"), person("operations", "uid-new")));
    await assertFails(updateDoc(doc(as.master(), "users/ops"), { active: false }));
    await assertFails(updateDoc(doc(as.ops(), "users/adv1"), { level_id: 2 }));
    await assertFails(updateDoc(doc(as.adv1(), "users/adv1"), { level_id: 3 }));
    await assertFails(setDoc(doc(as.ops(), "level_history/x"), { advisor_id: "adv1", from_level_id: 1, to_level_id: 2 }));
    await assertFails(setDoc(doc(as.master(), "weekly_results/x"), { advisor_id: "adv1" }));
  });
  test("advisors read only their own level history and weekly results", async () => {
    const db = as.adv1();
    await assertSucceeds(getDocs(query(collection(db, "level_history"), where("advisor_id", "==", "adv1"))));
    await assertFails(getDocs(collection(db, "level_history")));
    await assertFails(getDoc(doc(db, "level_history/h2")));
    await assertSucceeds(getDoc(doc(db, "weekly_results/adv1_2026-09-21")));
  });
});

describe("target levels", () => {
  const edit = (db, fields) => updateDoc(doc(db, "levels/1"), { updated_at: serverTimestamp(), ...fields });
  test("operations and master edit the weekly target, and only that", async () => {
    await assertSucceeds(edit(as.ops(), { target_letters: 250, updated_by: "ops" }));
    await assertSucceeds(edit(as.master(), { target_letters: 220, updated_by: "master" }));
    await assertFails(edit(as.ops(), { target_letters: 0, updated_by: "ops" }));
    await assertFails(edit(as.ops(), { target_letters: "300", updated_by: "ops" }));
    await assertFails(edit(as.ops(), { target_letters: 250, updated_by: "master" }), "must sign their own change");
    await assertFails(edit(as.ops(), { name: "Gold", updated_by: "ops" }));
    await assertFails(setDoc(doc(as.ops(), "levels/4"), { name: "Level 4", target_letters: 800, sort_order: 4 }));
    await assertFails(deleteDoc(doc(as.master(), "levels/2")));
  });
  test("advisors can read levels but not change them", async () => {
    await assertSucceeds(getDocs(collection(as.adv1(), "levels")));
    await assertFails(edit(as.adv1(), { target_letters: 10, updated_by: "adv1" }));
  });
});

describe("buildings (per advisor)", () => {
  test("advisors keep their own building list", async () => {
    const db = as.adv1();
    await assertSucceeds(setDoc(doc(db, "buildings/adv1__westgate"), { advisor_id: "adv1", key: "westgate", name: "Westgate", city: "Ahmedabad", city_key: "ahmedabad" }));
    await assertSucceeds(setDoc(doc(db, "buildings/adv1__shivalik-shilp"), { advisor_id: "adv1", key: "shivalik-shilp", name: "Shivalik Shilp" }, { merge: true }));
    await assertFails(setDoc(doc(db, "buildings/adv2__westgate"), { advisor_id: "adv2", key: "westgate", name: "Westgate" }));
    await assertFails(setDoc(doc(db, "buildings/adv1__westgate"), { advisor_id: "adv1", key: "other", name: "Westgate" }));
    await assertSucceeds(getDocs(query(collection(db, "buildings"), where("advisor_id", "==", "adv1"))));
    await assertFails(getDocs(collection(db, "buildings")));
  });
});
