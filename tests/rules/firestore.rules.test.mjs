// Security rules tests. Run: npm run test:rules (starts the Firestore emulator).
import { after, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, orderBy, query, setDoc, Timestamp, updateDoc, where,
} from "firebase/firestore";

let env;

const person = (role, uid, extra = {}) => ({ role, uid, active: true, full_name: role, email: `${uid}@example.com`, ...extra });
// Drops carry the creating advisor's own city and state (region_city/region_state), denormalized for franchise
// scoping. The default is adv1's region (Rajkot, Gujarat); other advisors override it.
const drop = (advisorId, extra = {}) => ({
  advisor_id: advisorId, office_number: "301-302", company_name: "Vasant Group", building_name: "Shivalik Shilp", block_no: "A",
  area: null, city: "Rajkot", full_address: null, region_city: "Rajkot", region_state: "Gujarat", drop_date: "2026-09-28",
  responded: false, response_type: "none", response_date: null, response_notes: null, response_phone: null, response_email: null,
  created_at: Timestamp.fromDate(new Date("2026-09-28T10:00:00+05:30")), search_tokens: ["3", "30", "301", "vasant", "b:shivalik-shilp"],
  ...extra,
});
const responded = (extra = {}) => ({ responded: true, response_type: "call", response_date: "2026-09-29", response_notes: "Called back", ...extra });
const lead = (advisorId, extra = {}) => ({
  advisor_id: advisorId, contact_name: "Mr. Patel", company_name: null, phone: "+91 98765 43210", email: null, notes: null,
  lead_date: "2026-09-29", drop_id: null, created_at: Timestamp.now(), ...extra,
});

// Signed-in people. Claims are what the server sets: { role, pid } plus, for advisors, their own { city, state }
// and, for operations accounts, their { scope_type, scope_value } (the franchise region they manage).
const as = {
  anon: () => env.unauthenticatedContext().firestore(),
  unlisted: () => env.authenticatedContext("uid-visitor", { email: "visitor@gmail.com", firebase: { sign_in_provider: "google.com" } }).firestore(),
  adv1: () => env.authenticatedContext("uid-adv1", { role: "advisor", pid: "adv1", city: "Rajkot", state: "Gujarat" }).firestore(),
  adv2: () => env.authenticatedContext("uid-adv2", { role: "advisor", pid: "adv2", city: "Ahmedabad", state: "Gujarat" }).firestore(),
  adv3: () => env.authenticatedContext("uid-adv3", { role: "advisor", pid: "adv3", city: "Mumbai", state: "Maharashtra" }).firestore(),
  // A city-scoped operations account (Rajkot) and a state-scoped one (the whole state of Gujarat).
  ops: () => env.authenticatedContext("uid-ops", { role: "operations", pid: "ops", scope_type: "city", scope_value: "Rajkot" }).firestore(),
  opsState: () => env.authenticatedContext("uid-ops-state", { role: "operations", pid: "ops-state", scope_type: "state", scope_value: "Gujarat" }).firestore(),
  master: () => env.authenticatedContext("uid-master", { role: "master", pid: "master" }).firestore(),
  deactivated: () => env.authenticatedContext("uid-gone", { role: "advisor", pid: "gone", city: "Rajkot", state: "Gujarat" }).firestore(),
  // Claims naming someone else's entry, or a role the entry does not have.
  otherUid: () => env.authenticatedContext("uid-intruder", { role: "advisor", pid: "adv1", city: "Rajkot", state: "Gujarat" }).firestore(),
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
      setDoc(doc(db, "users/ops"), person("operations", "uid-ops", { scope_type: "city", scope_value: "Rajkot" })),
      setDoc(doc(db, "users/ops-state"), person("operations", "uid-ops-state", { scope_type: "state", scope_value: "Gujarat" })),
      setDoc(doc(db, "users/adv1"), person("advisor", "uid-adv1", { advisor_code: "ADV001", city: "Rajkot", state: "Gujarat" })),
      setDoc(doc(db, "users/adv2"), person("advisor", "uid-adv2", { advisor_code: "ADV002", city: "Ahmedabad", state: "Gujarat" })),
      setDoc(doc(db, "users/adv3"), person("advisor", "uid-adv3", { advisor_code: "ADV003", city: "Mumbai", state: "Maharashtra" })),
      setDoc(doc(db, "users/gone"), person("advisor", "uid-gone", { advisor_code: "ADV009", city: "Rajkot", state: "Gujarat", active: false })),
      // d1 Rajkot (adv1), d2 Ahmedabad (adv2) — both Gujarat; d3 Mumbai (adv3) — Maharashtra.
      setDoc(doc(db, "drops/d1"), drop("adv1")),
      setDoc(doc(db, "drops/d2"), drop("adv2", { city: "Ahmedabad", region_city: "Ahmedabad", region_state: "Gujarat" })),
      setDoc(doc(db, "drops/d3"), drop("adv3", { city: "Mumbai", region_city: "Mumbai", region_state: "Maharashtra" })),
      setDoc(doc(db, "drops/dgone"), drop("gone")),
      setDoc(doc(db, "direct_leads/l1"), lead("adv1")),
      setDoc(doc(db, "direct_leads/l2"), lead("adv2")),
      setDoc(doc(db, "buildings/adv1__shivalik-shilp"), { advisor_id: "adv1", key: "shivalik-shilp", name: "Shivalik Shilp", region_city: "Rajkot", region_state: "Gujarat" }),
      setDoc(doc(db, "buildings/adv2__mondeal"), { advisor_id: "adv2", key: "mondeal", name: "Mondeal Heights", region_city: "Ahmedabad", region_state: "Gujarat" }),
      setDoc(doc(db, "buildings/adv3__bkc"), { advisor_id: "adv3", key: "bkc", name: "Bandra Kurla One", region_city: "Mumbai", region_state: "Maharashtra" }),
      // weekly_results is keyed by advisor and the week's Monday ("<advisor>_<monday>").
      setDoc(doc(db, "weekly_results/adv1_2026-09-21"), { advisor_id: "adv1", letters: 210, belt: "yellow" }),
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
      await assertFails(getDocs(collection(db, "direct_leads")));
      await assertFails(getDocs(collection(db, "weekly_results")));
      await assertFails(setDoc(doc(db, "drops/new"), drop("adv1")));
      await assertFails(setDoc(doc(db, "drops/new2"), drop("gone")));
      await assertFails(setDoc(doc(db, "direct_leads/new"), lead("adv1")));
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
  test("update their own drops but not the owner, the created time or the region, and never delete", async () => {
    const db = as.adv1();
    await assertSucceeds(updateDoc(doc(db, "drops/d1"), responded({ response_phone: "98765 43210" })));
    await assertFails(updateDoc(doc(db, "drops/d2"), responded({ response_phone: "98765 43210" })));
    await assertFails(updateDoc(doc(db, "drops/d1"), { advisor_id: "adv2" }));
    await assertFails(updateDoc(doc(db, "drops/d1"), { created_at: Timestamp.now() }));
    await assertFails(updateDoc(doc(db, "drops/d1"), { region_city: "Ahmedabad" }));
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
  test("a drop must carry the advisor's own region", async () => {
    await assertFails(create(drop("adv1", { region_city: null })));
    await assertFails(create(drop("adv1", { region_state: "   " })));
    await assertFails(create(drop("adv1", { region_city: "Ahmedabad" })), "a different city from the advisor's");
    await assertFails(create(drop("adv1", { region_state: "Maharashtra" })), "a different state from the advisor's");
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

describe("operations and master: reads, and no writes to drops or leads", () => {
  test("master reads every region", async () => {
    const db = as.master();
    await assertSucceeds(getDocs(query(collection(db, "drops"), orderBy("drop_date", "desc"))));
    for (const id of ["d1", "d2", "d3"]) await assertSucceeds(getDoc(doc(db, `drops/${id}`)));
    await assertSucceeds(getCountFromServer(query(collection(db, "drops"), where("responded", "==", true))));
    await assertSucceeds(getDocs(collection(db, "direct_leads")));
    await assertSucceeds(getDocs(collection(db, "buildings")));
    await assertSucceeds(getDocs(collection(db, "weekly_results")));
    await assertSucceeds(getDocs(query(collection(db, "users"), where("role", "==", "advisor"))));
    for (const id of ["adv1", "adv2", "adv3"]) await assertSucceeds(getDoc(doc(db, `users/${id}`)));
  });
  for (const who of ["ops", "master"]) {
    test(`${who}: cannot write drops or leads`, async () => {
      const db = as[who]();
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

describe("franchise region isolation", () => {
  test("a city-scoped operations account (Rajkot) sees only Rajkot advisors and drops", async () => {
    const db = as.ops();
    // Advisors: Rajkot only.
    await assertSucceeds(getDocs(query(collection(db, "users"), where("role", "==", "advisor"), where("city", "==", "Rajkot"))));
    await assertSucceeds(getDoc(doc(db, "users/adv1")), "a Rajkot advisor");
    await assertFails(getDoc(doc(db, "users/adv2")), "an Ahmedabad advisor");
    await assertFails(getDoc(doc(db, "users/adv3")), "a Mumbai advisor");
    await assertFails(getDocs(query(collection(db, "users"), where("role", "==", "advisor"))), "the unscoped advisor list is refused");
    await assertFails(getDocs(query(collection(db, "users"), where("role", "==", "advisor"), where("city", "==", "Ahmedabad"))), "another city");
    await assertFails(getDocs(query(collection(db, "users"), where("role", "==", "advisor"), where("state", "==", "Gujarat"))), "the whole state is wider than a city scope");
    // Drops: Rajkot only.
    await assertSucceeds(getDocs(query(collection(db, "drops"), where("region_city", "==", "Rajkot"), orderBy("drop_date", "desc"))));
    await assertSucceeds(getCountFromServer(query(collection(db, "drops"), where("region_city", "==", "Rajkot"))));
    await assertSucceeds(getDoc(doc(db, "drops/d1")), "a Rajkot drop");
    await assertFails(getDoc(doc(db, "drops/d2")), "an Ahmedabad drop");
    await assertFails(getDoc(doc(db, "drops/d3")), "a Mumbai drop");
    await assertFails(getDocs(query(collection(db, "drops"), orderBy("drop_date", "desc"))), "the unscoped drop list is refused");
    await assertFails(getDocs(query(collection(db, "drops"), where("region_city", "==", "Ahmedabad"), orderBy("drop_date", "desc"))), "another city");
    await assertFails(getDocs(query(collection(db, "drops"), where("region_state", "==", "Gujarat"), orderBy("drop_date", "desc"))), "a state query is wider than a city scope");
    // Buildings: Rajkot only.
    await assertSucceeds(getDocs(query(collection(db, "buildings"), where("region_city", "==", "Rajkot"))));
    await assertFails(getDocs(collection(db, "buildings")), "the unscoped building list is refused");
    await assertFails(getDoc(doc(db, "buildings/adv2__mondeal")), "an Ahmedabad building");
  });

  test("a state-scoped operations account (Gujarat) sees the whole state but not another state", async () => {
    const db = as.opsState();
    // Advisors: every Gujarat city (Rajkot + Ahmedabad), but not Maharashtra.
    await assertSucceeds(getDocs(query(collection(db, "users"), where("role", "==", "advisor"), where("state", "==", "Gujarat"))));
    await assertSucceeds(getDoc(doc(db, "users/adv1")), "Rajkot is in Gujarat");
    await assertSucceeds(getDoc(doc(db, "users/adv2")), "Ahmedabad is in Gujarat");
    await assertFails(getDoc(doc(db, "users/adv3")), "Mumbai is in Maharashtra");
    await assertFails(getDocs(query(collection(db, "users"), where("role", "==", "advisor"), where("state", "==", "Maharashtra"))), "another state");
    await assertFails(getDocs(query(collection(db, "users"), where("role", "==", "advisor"), where("city", "==", "Rajkot"))), "a city query does not match a state scope");
    // Drops: every Gujarat drop, but not Maharashtra.
    await assertSucceeds(getDocs(query(collection(db, "drops"), where("region_state", "==", "Gujarat"), orderBy("drop_date", "desc"))));
    await assertSucceeds(getDoc(doc(db, "drops/d1")), "a Rajkot (Gujarat) drop");
    await assertSucceeds(getDoc(doc(db, "drops/d2")), "an Ahmedabad (Gujarat) drop");
    await assertFails(getDoc(doc(db, "drops/d3")), "a Mumbai (Maharashtra) drop");
    await assertFails(getDocs(query(collection(db, "drops"), orderBy("drop_date", "desc"))), "the unscoped drop list is refused");
    await assertFails(getDocs(query(collection(db, "drops"), where("region_state", "==", "Maharashtra"), orderBy("drop_date", "desc"))), "another state");
    // Buildings across the state.
    await assertSucceeds(getDocs(query(collection(db, "buildings"), where("region_state", "==", "Gujarat"))));
    await assertFails(getDoc(doc(db, "buildings/adv3__bkc")), "a Maharashtra building");
  });

  test("advisors still read only their own drops, whatever their region", async () => {
    await assertSucceeds(getDoc(doc(as.adv3(), "drops/d3")));
    await assertFails(getDoc(doc(as.adv3(), "drops/d1")));
    await assertFails(getDoc(doc(as.adv1(), "drops/d3")));
  });

  test("an advisor cannot file a drop into another region", async () => {
    await assertSucceeds(setDoc(doc(as.adv2(), "drops/own"), drop("adv2", { region_city: "Ahmedabad", region_state: "Gujarat" })), "their own region");
    await assertFails(setDoc(doc(as.adv2(), "drops/elsewhere"), drop("adv2", { region_city: "Rajkot", region_state: "Gujarat" })), "another city");
    await assertFails(setDoc(doc(as.adv3(), "drops/elsewhere"), drop("adv3", { region_city: "Mumbai", region_state: "Gujarat" })), "the wrong state for this advisor");
  });
});

describe("the access list and the weekly belt snapshot are server-only", () => {
  test("nobody writes them from the app", async () => {
    await assertFails(setDoc(doc(as.master(), "users/new-ops"), person("operations", "uid-new")));
    await assertFails(updateDoc(doc(as.master(), "users/ops"), { active: false }));
    await assertFails(updateDoc(doc(as.ops(), "users/adv1"), { city: "Ahmedabad" }));
    await assertFails(updateDoc(doc(as.adv1(), "users/adv1"), { city: "Ahmedabad" }));
    await assertFails(setDoc(doc(as.master(), "weekly_results/x"), { advisor_id: "adv1", belt: "green" }));
    await assertFails(updateDoc(doc(as.ops(), "weekly_results/adv1_2026-09-21"), { belt: "green" }));
  });
  test("advisors read only their own weekly results", async () => {
    const db = as.adv1();
    await assertSucceeds(getDoc(doc(db, "weekly_results/adv1_2026-09-21")));
    await assertSucceeds(getDocs(query(collection(db, "weekly_results"), where("advisor_id", "==", "adv1"))));
    await assertFails(getDocs(collection(db, "weekly_results")));
  });
});

describe("buildings (per advisor)", () => {
  test("advisors keep their own building list, stamped with their region", async () => {
    const db = as.adv1();
    await assertSucceeds(setDoc(doc(db, "buildings/adv1__westgate"), { advisor_id: "adv1", key: "westgate", name: "Westgate", city: "Rajkot", city_key: "rajkot", region_city: "Rajkot", region_state: "Gujarat" }));
    await assertSucceeds(setDoc(doc(db, "buildings/adv1__shivalik-shilp"), { advisor_id: "adv1", key: "shivalik-shilp", name: "Shivalik Shilp", region_city: "Rajkot", region_state: "Gujarat" }, { merge: true }));
    await assertFails(setDoc(doc(db, "buildings/adv2__westgate"), { advisor_id: "adv2", key: "westgate", name: "Westgate", region_city: "Rajkot", region_state: "Gujarat" }));
    await assertFails(setDoc(doc(db, "buildings/adv1__westgate"), { advisor_id: "adv1", key: "other", name: "Westgate", region_city: "Rajkot", region_state: "Gujarat" }));
    await assertFails(setDoc(doc(db, "buildings/adv1__elsewhere"), { advisor_id: "adv1", key: "elsewhere", name: "Elsewhere", region_city: "Ahmedabad", region_state: "Gujarat" }), "stamped with another region");
    await assertSucceeds(getDocs(query(collection(db, "buildings"), where("advisor_id", "==", "adv1"))));
    await assertFails(getDocs(collection(db, "buildings")));
  });
});
