#!/usr/bin/env node
// Fills the local Firebase emulators with sample people and drops (development and the end-to-end test only).
//   npm run emulators        # terminal 1
//   npm run emulators:seed   # terminal 2 (clears the emulators first)
// Everyone signs in through the Auth emulator's "Sign in with Google" page with one of these emails:
//   master@example.com, ops@example.com, riya.shah@example.com, karan.mehta@example.com, neha.desai@example.com
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { buildingKey, cityKey, dropIndexTokens } from "../src/lib/search.ts";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
const projectId = process.env.GCLOUD_PROJECT || "demo-tba";
if (!projectId.startsWith("demo-")) {
  console.error(`Refusing to seed project "${projectId}": this script is for the emulators (demo-* projects) only.`);
  process.exit(1);
}

await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });

initializeApp({ projectId });
const db = getFirestore();

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
const created = Timestamp.fromDate(daysAgo(60));

const LEVELS = [
  { id: "1", name: "Level 1", target_letters: 200, sort_order: 1 },
  { id: "2", name: "Level 2", target_letters: 350, sort_order: 2 },
  { id: "3", name: "Level 3", target_letters: 500, sort_order: 3 },
];
const person = (role, full_name, email, extra = {}) => ({
  role, full_name, email, advisor_code: null, region: null, level_id: null, active: true, uid: null, created_at: created, ...extra,
});
const PEOPLE = {
  "u-master": person("master", "Master Admin", "master@example.com"),
  "u-ops": person("operations", "Ops Admin", "ops@example.com"),
  "u-adv1": person("advisor", "Riya Shah", "riya.shah@example.com", { advisor_code: "ADV001", region: "Ahmedabad West", level_id: 1 }),
  "u-adv2": person("advisor", "Karan Mehta", "karan.mehta@example.com", { advisor_code: "ADV002", region: "Surat", level_id: 2 }),
  "u-adv3": person("advisor", "Neha Desai", "neha.desai@example.com", { advisor_code: "ADV003", region: "Vadodara", level_id: 1 }),
};
const BUILDINGS = {
  Ahmedabad: [["Shivalik Shilp", "Satellite"], ["Titanium City Centre", "Prahlad Nagar"], ["Westgate", "SG Highway"]],
  Surat: [["International Trade Centre", "Majura Gate"], ["Belgium Square", "Delhi Gate"]],
  Vadodara: [["Alkapuri Arcade", "Alkapuri"], ["Siddharth Complex", "Race Course"]],
};
const COMPANIES = ["Shree Traders", "Apex Infotech", "Om Exports", "Galaxy Diamonds", "Radiant Associates", "Sai Textiles", "Nova Pharma", "Zenith Realty"];
const PLAN = [["u-adv1", "Ahmedabad", 7], ["u-adv2", "Surat", 9], ["u-adv3", "Vadodara", 4]]; // letters per working day

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];

const writer = db.bulkWriter();
for (const l of LEVELS) writer.set(db.doc(`levels/${l.id}`), { name: l.name, target_letters: l.target_letters, sort_order: l.sort_order });
for (const [id, p] of Object.entries(PEOPLE)) writer.set(db.doc(`users/${id}`), p);

let count = 0;
const buildings = new Map();
function addDrop(advisorId, d, minutes) {
  const day = new Date(`${d.drop_date}T10:00:00`);
  day.setMinutes(minutes);
  const drop = {
    advisor_id: advisorId, area: null, city: null, full_address: null, responded: false, response_type: "none", response_date: null,
    response_notes: null, response_phone: null, response_email: null, ...d,
    created_at: Timestamp.fromDate(new Date(Math.min(day.getTime(), Date.now() - 60_000))),
  };
  drop.search_tokens = dropIndexTokens(drop);
  writer.set(db.collection("drops").doc(), drop);
  const key = buildingKey(drop.building_name);
  const b = buildings.get(`${advisorId}__${key}`) ?? { advisor_id: advisorId, key, name: drop.building_name };
  if (drop.city && !b.city) Object.assign(b, { city: drop.city, city_key: cityKey(drop.city) });
  buildings.set(`${advisorId}__${key}`, b);
  count++;
}

for (const [advisorId, city, perDay] of PLAN) {
  for (let ago = 20; ago >= 1; ago--) {
    const day = daysAgo(ago);
    if (day.getDay() === 0) continue; // Sundays off
    const [building, area] = pick(BUILDINGS[city]);
    const floor = 1 + Math.floor(rand() * 9);
    for (let i = 0; i < perDay; i++) {
      const answered = ago > 2 && rand() < 0.1;
      addDrop(advisorId, {
        office_number: `${floor}${String(i + 1).padStart(2, "0")}`, company_name: pick(COMPANIES), building_name: building,
        block_no: pick(["A", "B"]), area, city: rand() < 0.8 ? city : null, drop_date: ymd(day),
        ...(answered ? {
          responded: true, response_type: "call", response_date: ymd(daysAgo(ago - 1)), response_notes: "Asked for a callback",
          response_phone: `+91 98${String(Math.floor(rand() * 1e8)).padStart(8, "0")}`,
        } : {}),
      }, i * 4);
    }
  }
}
// The business's own example entry.
addDrop("u-adv1", { office_number: "301-302", company_name: "Vasant Group", building_name: "Shivalik Shilp", block_no: "A", area: "Ahmedabad", drop_date: ymd(daysAgo(1)) }, 200);

for (const [id, b] of buildings) writer.set(db.doc(`buildings/${id}`), b);
await writer.close();
console.log(`Seeded project ${projectId}: ${Object.keys(PEOPLE).length} people, ${count} drops.`);
process.exit(0);
