import { currentWeek } from "@/lib/stats";
import type { DemoAccount, Drop, Lead, Profile } from "./types";

export type MockDb = {
  version: number;
  profiles: Profile[];
  drops: Drop[];
  leads: Lead[];
};

/** Bump when the shape or volume of the sample data changes; old browser data is then replaced. */
export const MOCK_VERSION = 8;

/** A Google account that is not on the access list, to show the "not authorised" screen. */
export const DEMO_UNLISTED: DemoAccount = { email: "visitor@example.com", name: "Visitor", note: "Not on the list" };

type Building = { name: string; area: string; address: string; blocks: string[] };

// Sample buildings per city. Advisors leave letters in the city they are based in, so these cover the demo
// cities: Rajkot and Ahmedabad (Gujarat) and Mumbai (Maharashtra).
const BUILDINGS: Record<string, Building[]> = {
  Ahmedabad: [
    { name: "Shivalik Shilp", area: "Satellite", address: "Iscon Cross Rd, Satellite", blocks: ["A", "B"] },
    { name: "Titanium City Centre", area: "Prahlad Nagar", address: "100 Ft Anand Nagar Rd", blocks: ["A", "B", "C"] },
    { name: "Mondeal Heights", area: "SG Highway", address: "Near Wide Angle, SG Highway", blocks: ["1", "2"] },
    { name: "Iscon Emporio", area: "Satellite", address: "Star Bazaar Cross Rd, Satellite", blocks: ["A"] },
    { name: "Venus Atlantis", area: "Prahlad Nagar", address: "Corporate Rd, Prahlad Nagar", blocks: ["A", "B"] },
    { name: "Westgate", area: "SG Highway", address: "Near YMCA Club, SG Highway", blocks: ["A", "B", "C", "D"] },
    { name: "Sun Westbank", area: "Ashram Road", address: "Near Vallabh Sadan, Ashram Rd", blocks: ["1"] },
    { name: "Pinnacle Business Park", area: "Corporate Road", address: "Corporate Rd, Prahlad Nagar", blocks: ["1", "2"] },
  ],
  Rajkot: [
    { name: "Crystal Mall", area: "Kalawad Road", address: "Kalawad Rd, Rajkot", blocks: ["A", "B"] },
    { name: "Imperial Heights", area: "150 Ft Ring Road", address: "150 Ft Ring Rd, Rajkot", blocks: ["A", "B", "C"] },
    { name: "Shivalik Business Park", area: "Nana Mava", address: "Nana Mava Main Rd", blocks: ["1", "2"] },
    { name: "RK Supreme", area: "Kalawad Road", address: "Near Nirmala School, Kalawad Rd", blocks: ["A"] },
    { name: "The Spire", area: "University Road", address: "University Rd, Rajkot", blocks: ["A", "B"] },
    { name: "Nilkanth Residency", area: "Mavdi", address: "Mavdi Main Rd", blocks: ["1"] },
    { name: "Madhav Plaza", area: "Yagnik Road", address: "Yagnik Rd, Rajkot", blocks: ["A", "B", "C"] },
  ],
  Mumbai: [
    { name: "Nariman Point Tower", area: "Nariman Point", address: "Nariman Point, Mumbai", blocks: ["A", "B"] },
    { name: "Bandra Kurla One", area: "BKC", address: "Bandra Kurla Complex", blocks: ["1", "2", "3"] },
    { name: "Lower Parel Square", area: "Lower Parel", address: "Senapati Bapat Marg", blocks: ["A", "B"] },
    { name: "Andheri Trade Hub", area: "Andheri East", address: "Chakala, Andheri East", blocks: ["A"] },
    { name: "Powai Techpark", area: "Powai", address: "Hiranandani Gardens, Powai", blocks: ["1", "2"] },
    { name: "Fort Chambers", area: "Fort", address: "Dadabhai Naoroji Rd, Fort", blocks: ["A", "B"] },
  ],
};

const NAME_A = ["Shree", "Om", "Jay", "Sai", "Krishna", "Mahalaxmi", "Siddhi", "Patel", "Shah", "Mehta", "Desai", "Apex", "Nova", "Pioneer",
  "Galaxy", "Royal", "Unique", "Sunrise", "Orbit", "Vega", "Trident", "Zenith", "Aarav", "Kavya", "Radiant", "Evergreen", "Silverline", "Crescent"];
const NAME_B = ["Traders", "Enterprises", "Exports", "Infotech", "Associates", "Consultants", "Textiles", "Chemicals", "Industries", "Logistics",
  "Pharma", "Realty", "Solutions", "& Co.", "Diamonds", "Agencies", "Tax Consultants", "Finserv", "Engineering", "Impex"];
const NOTES = ["Asked for a callback next week", "Wants the brochure by email", "Interested in tax planning", "Meeting fixed for Saturday",
  "Requested pricing details", "Not interested right now", "Asked about SIP options", "Will visit the office"];

const PEOPLE = ["rahul", "priya", "amit", "neha", "vikas", "pooja", "kunal", "sneha", "jignesh", "hetal", "mehul", "krupa"];
const MAILBOXES = ["info", "accounts", "admin", "contact", "office"];
const DOMAINS = [".com", ".in", ".co.in"];

/**
 * Sample advisors. DEMO DATA ONLY — this does not change the real belt thresholds, the weekly count, or the
 * competition week (Monday 09:00 to Monday 09:00 IST). `week` is how many entries the advisor has IN THE CURRENT
 * competition week, chosen so the belt leaderboard always shows the full spread the moment the owner opens the
 * demo, whatever day it is: two advisors land squarely in each belt — Red (<200), Yellow (200-349),
 * Blue (350-500), Green (501+). `base` is a modest weekly pace for the back-history (month chart + totals).
 */
type AdvisorSpec = { id: string; name: string; code: string; city: string; state: string; zip: string; week: number; base: number };
// Advisors across two states (Gujarat: Rajkot + Ahmedabad; Maharashtra: Mumbai), each city spanning several belts,
// so the franchise scoping is visible: a Rajkot city manager sees the Rajkot spread, a Gujarat state manager sees
// Rajkot + Ahmedabad (all four belts) but not Mumbai, and the master sees everyone.
const GUJARAT = "Gujarat";
const MAHARASHTRA = "Maharashtra";
const ADVISORS: AdvisorSpec[] = [
  // Rajkot (Gujarat): Green, Blue, Red
  { id: "u-adv2", name: "Dhruv Kacha", code: "ADV002", city: "Rajkot", state: GUJARAT, zip: "360001", week: 650, base: 38 }, // Green
  { id: "u-adv5", name: "Isha Vora", code: "ADV005", city: "Rajkot", state: GUJARAT, zip: "360005", week: 420, base: 26 }, // Blue
  { id: "u-adv8", name: "Manav Gondaliya", code: "ADV008", city: "Rajkot", state: GUJARAT, zip: "360002", week: 150, base: 11 }, // Red
  // Ahmedabad (Gujarat): Green, Yellow, Red
  { id: "u-adv1", name: "Riya Shah", code: "ADV001", city: "Ahmedabad", state: GUJARAT, zip: "380015", week: 560, base: 34 }, // Green
  { id: "u-adv7", name: "Vikram Shah", code: "ADV007", city: "Ahmedabad", state: GUJARAT, zip: "380006", week: 250, base: 16 }, // Yellow
  { id: "u-adv3", name: "Neha Desai", code: "ADV003", city: "Ahmedabad", state: GUJARAT, zip: "380054", week: 180, base: 13 }, // Red
  // Mumbai (Maharashtra): Blue, Yellow
  { id: "u-adv4", name: "Karan Mehta", code: "ADV004", city: "Mumbai", state: MAHARASHTRA, zip: "400021", week: 470, base: 28 }, // Blue
  { id: "u-adv6", name: "Ananya Iyer", code: "ADV006", city: "Mumbai", state: MAHARASHTRA, zip: "400051", week: 300, base: 20 }, // Yellow
];
const HISTORY_WEEKS = 16;
const IST_OFFSET_MIN = 330; // Asia/Kolkata is UTC+5:30

/** Small deterministic PRNG so the sample data (counts, companies, responses) is the same on every fresh load. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

// ---------- dates as YYYY-MM-DD strings, aligned with the IST competition week ----------
const DAY_MS = 86_400_000;
const parseYmd = (s: string) => Date.parse(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => new Date(parseYmd(s) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((parseYmd(b) - parseYmd(a)) / DAY_MS);
const weekday = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay(); // 0 = Sunday
/** The calendar date of an instant in IST, as YYYY-MM-DD (matches currentWeek()'s basis). */
function istDate(at: Date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function buildSeed(): MockDb {
  const now = new Date();
  const week = currentWeek(now); // { start: this week's Monday, end: the following Sunday }, IST
  const todayStr = istDate(now);
  const createdIso = (daysAgo: number) => new Date(parseYmd(addDays(todayStr, -daysAgo)) + 9 * 3600000).toISOString();

  const admin = (over: Partial<Profile> & Pick<Profile, "id" | "role" | "full_name" | "email">): Profile => ({
    advisor_code: null, city: null, state: null, zip: null, scope_type: null, scope_value: null,
    active: true, created_at: createdIso(120), ...over,
  });
  const profiles: Profile[] = [
    admin({ id: "u-master", role: "master", full_name: "Master Admin", email: "master@example.com" }),
    // Two scoped operations accounts for the demo: one city (Rajkot), one whole state (Gujarat).
    admin({ id: "u-ops-city", role: "operations", full_name: "Rajkot Ops", email: "rajkot.ops@example.com", scope_type: "city", scope_value: "Rajkot" }),
    admin({ id: "u-ops-state", role: "operations", full_name: "Gujarat Ops", email: "gujarat.ops@example.com", scope_type: "state", scope_value: GUJARAT }),
    ...ADVISORS.map((a): Profile => ({
      id: a.id, role: "advisor", full_name: a.name, email: `${a.name.toLowerCase().replace(/[^a-z]/g, ".")}@example.com`,
      advisor_code: a.code, city: a.city, state: a.state, zip: a.zip, scope_type: null, scope_value: null,
      active: true, created_at: createdIso(90),
    })),
  ];

  const rand = rng(42);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  /** An Indian mobile number, written the way people type them. */
  const phoneNumber = () => {
    const digits = String(6 + Math.floor(rand() * 4)) + Array.from({ length: 9 }, () => Math.floor(rand() * 10)).join("");
    const [a, b] = [digits.slice(0, 5), digits.slice(5)];
    return pick([`+91 ${a} ${b}`, `${a} ${b}`, digits, `+91-${a}-${b}`]);
  };
  const emailFor = (company: string) =>
    `${rand() < 0.5 ? pick(MAILBOXES) : pick(PEOPLE)}@${company.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "")}${pick(DOMAINS)}`;

  const drops: Drop[] = [];
  let seq = 0;

  /** One building visit: walk up the floors leaving `count` letters, one per office, all dated `dateStr`. */
  function visit(advisorId: string, city: string, state: string, dateStr: string, count: number, startMinute: number) {
    const b = pick(BUILDINGS[city]);
    const block = pick(b.blocks);
    let floor = 1 + Math.floor(rand() * 8);
    let unit = 1;
    const age = daysBetween(dateStr, todayStr); // 0 = today, larger = further in the past
    for (let i = 0; i < count; i++) {
      while (rand() < 0.35) unit++; // closed or skipped offices
      if (unit > 8) { floor++; unit = 1 + Math.floor(rand() * 2); }
      const joined = rand() < 0.12 && unit < 8;
      const num = (u: number) => `${floor}${String(u).padStart(2, "0")}`;
      const office = joined ? `${num(unit)}-${num(unit + 1)}` : num(unit);
      unit += joined ? 2 : 1;

      const company = `${pick(NAME_A)} ${pick(NAME_B)}`;
      const responded = age >= 2 && rand() < 0.05;
      const respDate = responded ? addDays(dateStr, 1 + Math.floor(rand() * Math.min(10, age - 1))) : null;
      const type = responded ? (rand() < 0.65 ? "call" : "email") : "none";
      // Callers leave a number (sometimes an email too); emails come with an address (sometimes a number).
      const phone = type === "call" || (type === "email" && rand() < 0.3) ? phoneNumber() : null;
      const email = type === "email" || (type === "call" && rand() < 0.25) ? emailFor(company) : null;
      // Entered from ~10:00 IST that day; never in the future, so today's entries stay in the past.
      const plannedMs = parseYmd(dateStr) + (10 * 60 - IST_OFFSET_MIN + startMinute + i * 3) * 60_000;
      const created = new Date(Math.min(plannedMs, now.getTime() - 60_000));
      drops.push({
        id: `d-${++seq}`,
        advisor_id: advisorId,
        office_number: office,
        company_name: company,
        building_name: b.name,
        block_no: block,
        area: rand() < 0.9 ? b.area : null,
        city: rand() < 0.8 ? city : null,
        full_address: rand() < 0.45 ? `${b.name}, ${b.address}` : null,
        drop_date: dateStr,
        region_city: city,
        region_state: state,
        responded,
        response_type: type,
        response_date: respDate,
        response_notes: responded ? pick(NOTES) : null,
        response_phone: phone,
        response_email: email,
        created_at: created.toISOString(),
      });
    }
  }

  /** Spread `total` letters across `days` and leave them building by building. */
  function generate(advisorId: string, city: string, state: string, days: string[], total: number) {
    if (!days.length || total <= 0) return;
    const perDay = days.map(() => 0);
    for (let i = 0; i < total; i++) perDay[Math.floor(rand() * days.length)]++;
    days.forEach((day, i) => {
      let left = perDay[i];
      let minute = 0;
      while (left > 0) {
        const n = Math.min(left, 8 + Math.floor(rand() * 30));
        visit(advisorId, city, state, day, n, minute);
        minute += n * 3 + 20;
        left -= n;
      }
    });
  }

  // Current competition week: fill each advisor's full weekly entries, dated across the week's working days up to
  // today (so the belt spread is already there whenever the demo is opened, but no entries are dated in the future).
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week.start, i)); // Monday..Sunday
  const upToToday = weekDays.filter((d) => d <= todayStr);
  const workingSoFar = upToToday.filter((d) => weekday(d) !== 0); // advisors work Mon-Sat
  const currentDays = workingSoFar.length ? workingSoFar : upToToday;
  for (const a of ADVISORS) generate(a.id, a.city, a.state, currentDays, a.week);

  // Back-history for the month-wise chart and all-time totals: a modest, tapering weekly pace.
  for (const a of ADVISORS) {
    for (let w = 1; w <= HISTORY_WEEKS; w++) {
      const ws = addDays(week.start, -7 * w); // the Monday of that past week
      const days = Array.from({ length: 6 }, (_, i) => addDays(ws, i)); // Mon..Sat of that past week
      generate(a.id, a.city, a.state, days, Math.round(a.base * Math.max(0.2, 1 - 0.05 * (w - 1))));
    }
  }

  // The entry the business used as its example: Office 301-302, Vasant Group, Block A, Area Ahmedabad (Riya, this week).
  const exampleDay = currentDays[currentDays.length - 1];
  drops.push({
    id: `d-${++seq}`, advisor_id: "u-adv1", office_number: "301-302", company_name: "Vasant Group", building_name: "Shivalik Shilp",
    block_no: "A", area: "Ahmedabad", city: null, full_address: null, drop_date: exampleDay,
    region_city: "Ahmedabad", region_state: GUJARAT,
    responded: false, response_type: "none", response_date: null, response_notes: null, response_phone: null, response_email: null,
    created_at: new Date(Math.min(parseYmd(exampleDay) + (9 * 60 + 30 - IST_OFFSET_MIN) * 60_000, now.getTime() - 60_000)).toISOString(),
  });

  drops.sort((x, y) => y.drop_date.localeCompare(x.drop_date) || y.created_at.localeCompare(x.created_at));
  const respondedRiya = drops.find((d) => d.advisor_id === "u-adv1" && d.responded);

  return {
    version: MOCK_VERSION,
    profiles,
    drops,
    leads: [
      { id: "l-1", advisor_id: "u-adv1", drop_id: respondedRiya?.id ?? null, contact_name: "Mr. Patel", company_name: respondedRiya?.company_name ?? "Shree Traders",
        phone: "+91 98765 43210", email: null, notes: "Called back after the letter; wants a meeting", lead_date: addDays(todayStr, -3), created_at: createdIso(3) },
      { id: "l-2", advisor_id: "u-adv1", drop_id: null, contact_name: "Ms. Joshi", company_name: "Radiant Associates", phone: null, email: "joshi@example.com",
        notes: "Referred by a client at Westgate", lead_date: addDays(todayStr, -6), created_at: createdIso(6) },
      { id: "l-3", advisor_id: "u-adv2", drop_id: null, contact_name: "Mr. Desai", company_name: "Galaxy Diamonds", phone: "+91 99250 11223", email: null,
        notes: "Met at the lift lobby, asked for a call", lead_date: addDays(todayStr, -2), created_at: createdIso(2) },
    ],
  };
}
