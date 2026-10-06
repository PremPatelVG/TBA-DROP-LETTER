import { buildingKey, matchesDropSearch, matchesPlace } from "@/lib/search";
import { lastMonths, totals } from "@/lib/stats";
import { buildSeed, DEMO_UNLISTED, MOCK_VERSION, type MockDb } from "./mock-seed";
import { isAdminRole, type AccessResult, type DataApi, type Drop, type DropFilter, type Profile } from "./types";

// Versioned key: bumping it leaves old browser data behind and loads fresh sample data.
const DB_KEY = "tba.mock.db.v6";
const OLD_KEYS = ["tba.mock.db", "tba.mock.db.v3", "tba.mock.db.v4", "tba.mock.db.v5"];
const SESSION_KEY = "tba.mock.session.email";

let memory: MockDb | null = null;
let memorySession: string | null = null;

function load(): MockDb {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(DB_KEY);
    const parsed = raw ? (JSON.parse(raw) as MockDb) : null;
    if (parsed?.version === MOCK_VERSION) return (memory = parsed);
  } catch {
    // storage unavailable or corrupt: fall through to a fresh seed
  }
  memory = buildSeed();
  try { OLD_KEYS.forEach((k) => localStorage.removeItem(k)); localStorage.removeItem("tba.mock.session"); } catch { /* ignore */ }
  save();
  return memory;
}
function save() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(memory)); } catch { /* in-memory only */ }
}
function getSession() {
  try { return localStorage.getItem(SESSION_KEY) ?? memorySession; } catch { return memorySession; }
}
function setSession(email: string | null) {
  memorySession = email;
  try { if (email) localStorage.setItem(SESSION_KEY, email); else localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));
const cleanEmail = (e: string) => e.trim().toLowerCase();

/** Same decision as the server's access check: listed and active, by Google email. */
function access(email: string): AccessResult {
  const p = load().profiles.find((x) => x.email === cleanEmail(email));
  if (!p) return { status: "not_authorised", email, reason: "not_listed" };
  if (!p.active) return { status: "not_authorised", email, reason: "deactivated" };
  return { status: "ok", profile: p };
}

function me(): Profile {
  const email = getSession();
  const a = email ? access(email) : null;
  if (a?.status !== "ok") throw new Error("Not signed in");
  return a.profile;
}
function requireOps() {
  const p = me();
  if (!isAdminRole(p.role)) throw new Error("Operations only");
  return p;
}
function requireMaster() {
  const p = me();
  if (p.role !== "master") throw new Error("Master only");
  return p;
}

const newestFirst = (a: Drop, b: Drop) => b.drop_date.localeCompare(a.drop_date) || b.created_at.localeCompare(a.created_at);

/** Imitates the security rules: advisors only see their own rows. */
const visible = <T extends { advisor_id: string }>(rows: T[], advisorId?: string) => {
  const p = me();
  const scope = isAdminRole(p.role) ? advisorId : p.id;
  return scope ? rows.filter((r) => r.advisor_id === scope) : rows;
};

function filtered(f: DropFilter) {
  return visible(load().drops, f.advisorId).filter((d) =>
    (!f.from || d.drop_date >= f.from) &&
    (!f.to || d.drop_date <= f.to) &&
    matchesPlace(d, f) &&
    matchesDropSearch(d, f.q));
}

export const mockApi: DataApi = {
  mode: "mock",
  async currentAccess() {
    const email = getSession();
    if (!email) return wait(null);
    const a = access(email);
    if (a.status !== "ok") setSession(null);
    return wait(a);
  },
  async signInWithGoogle(opts) {
    const demoEmail = opts?.demoEmail;
    if (!demoEmail) return wait({ status: "cancelled" } as const);
    const a = access(demoEmail);
    setSession(a.status === "ok" ? cleanEmail(demoEmail) : null);
    return wait(a);
  },
  async signOut() { setSession(null); },
  async demoAccounts() {
    const people = load().profiles.map((p) => ({
      email: p.email,
      name: p.full_name,
      note: `${p.role === "advisor" ? `Advisor ${p.advisor_code}` : p.role === "master" ? "Master" : "Operations"}${p.active ? "" : " (deactivated)"}`,
    }));
    return wait([...people, DEMO_UNLISTED]);
  },
  subscribeSyncErrors() {
    return () => {}; // demo data is saved in this browser right away; nothing syncs later
  },

  async listAdvisors() {
    requireOps();
    return wait(load().profiles.filter((p) => p.role === "advisor").sort((a, b) => (a.advisor_code ?? "").localeCompare(b.advisor_code ?? "")));
  },
  async createAdvisor(input) {
    requireOps();
    const db = load();
    const code = input.advisor_code.trim().toUpperCase();
    const email = cleanEmail(input.email);
    if (db.profiles.some((p) => p.advisor_code === code)) throw new Error(`Advisor ID ${code} already exists.`);
    if (db.profiles.some((p) => p.email === email)) throw new Error(`${email} is already on the list.`);
    const first = [...db.levels].sort((a, b) => a.sort_order - b.sort_order)[0];
    const p: Profile = { id: uid("u"), role: "advisor", full_name: input.full_name.trim(), email, advisor_code: code, region: input.region.trim(), level_id: first?.id ?? null, active: true, created_at: new Date().toISOString() };
    db.profiles.push(p);
    save();
    return wait(p);
  },
  async listOpsUsers() {
    requireMaster();
    return wait(load().profiles.filter((p) => p.role === "operations").sort((a, b) => a.full_name.localeCompare(b.full_name)));
  },
  async createOpsUser(input) {
    requireMaster();
    const db = load();
    const email = cleanEmail(input.email);
    if (db.profiles.some((p) => p.email === email)) throw new Error(`${email} is already on the list.`);
    const p: Profile = { id: uid("u"), role: "operations", full_name: input.full_name.trim(), email, advisor_code: null, region: null, level_id: null, active: true, created_at: new Date().toISOString() };
    db.profiles.push(p);
    save();
    return wait(p);
  },
  async setUserActive(id, active) {
    const actor = requireOps();
    const target = load().profiles.find((p) => p.id === id);
    if (!target) throw new Error("User not found");
    if (target.id === actor.id) throw new Error("You cannot deactivate yourself.");
    const allowed = target.role === "advisor" || (target.role === "operations" && actor.role === "master");
    if (!allowed) throw new Error("Only master can manage operations accounts.");
    target.active = active;
    save();
  },

  async findDrops(f, { limit, cursor }) {
    const start = typeof cursor === "number" ? cursor : 0;
    const rows = filtered(f).sort(newestFirst);
    const end = start + limit;
    return wait({ rows: rows.slice(start, end), cursor: end < rows.length ? end : null });
  },
  async countDrops(f) {
    const rows = filtered(f);
    return wait({ letters: rows.length, responses: rows.filter((d) => d.responded).length });
  },
  async getDrop(id) { return wait(visible(load().drops).find((d) => d.id === id) ?? null); },
  async createDrop(input) {
    const p = me();
    if (p.role !== "advisor") throw new Error("Only advisors log drops");
    const d: Drop = { ...input, id: uid("d"), advisor_id: p.id, created_at: new Date().toISOString(), responded: false, response_type: "none", response_date: null, response_notes: null, response_phone: null, response_email: null };
    load().drops.push(d);
    save();
    return wait(d);
  },
  async updateDropResponse(id, r) {
    const d = visible(load().drops).find((x) => x.id === id);
    if (!d) throw new Error("Drop not found.");
    // Same rule as the security rules: a responded letter needs the responder's phone number or email.
    if (r.responded && !r.response_phone?.trim() && !r.response_email?.trim()) {
      throw new Error("Add the phone number or email of the person who responded.");
    }
    Object.assign(d, r);
    save();
    return wait(undefined);
  },
  async listBuildings() {
    const seen = new Map<string, { name: string; city: string | null }>();
    for (const d of visible(load().drops)) {
      const k = buildingKey(d.building_name);
      if (!seen.has(k) || (!seen.get(k)!.city && d.city)) seen.set(k, { name: d.building_name, city: d.city });
    }
    return wait([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)));
  },

  async advisorSummary(advisorId, week) {
    const rows = visible(load().drops, advisorId);
    const t = totals(rows);
    return wait({ letters: t.letters, responses: t.responses, buildings: t.buildings, weekLetters: rows.filter((d) => d.drop_date >= week.start && d.drop_date <= week.end).length });
  },
  async opsSummary(week, advisorIds) {
    requireOps();
    const all = load().drops;
    const t = totals(all);
    const months = lastMonths(6).map((m) => {
      const rows = all.filter((d) => d.drop_date >= m.start && d.drop_date <= m.end);
      return { key: m.key, label: m.label, letters: rows.length, responses: rows.filter((d) => d.responded).length };
    });
    const perAdvisor = Object.fromEntries(advisorIds.map((id) => {
      const rows = all.filter((d) => d.advisor_id === id);
      const a = totals(rows);
      return [id, { letters: a.letters, responses: a.responses, buildings: a.buildings, weekLetters: rows.filter((d) => d.drop_date >= week.start && d.drop_date <= week.end).length }];
    }));
    return wait({ letters: t.letters, responses: t.responses, buildings: t.buildings, months, perAdvisor });
  },
  async beltLeaderboard(week) {
    me(); // any signed-in user may read the leaderboard (advisors included)
    const db = load();
    // "entries this week": each advisor's drops whose drop_date falls in the current competition week.
    // Easy to switch to all-time totals later: drop the drop_date range and count all of the advisor's drops.
    return wait(
      db.profiles
        .filter((p) => p.role === "advisor")
        .map((a) => ({
          advisorId: a.id,
          full_name: a.full_name,
          advisor_code: a.advisor_code,
          region: a.region,
          weekEntries: db.drops.filter((d) => d.advisor_id === a.id && d.drop_date >= week.start && d.drop_date <= week.end).length,
        })),
    );
  },

  async listLevels() { return wait(load().levels.slice().sort((a, b) => a.sort_order - b.sort_order)); },
  async updateLevelTarget(id, target) {
    requireOps();
    const l = load().levels.find((x) => x.id === id);
    if (!l) throw new Error("Level not found");
    l.target_letters = target;
    save();
  },
  async changeAdvisorLevel(advisorId, levelId, reason) {
    const ops = requireOps();
    const db = load();
    const a = db.profiles.find((p) => p.id === advisorId);
    if (!a) throw new Error("Advisor not found");
    if (a.level_id === levelId) return;
    db.levelHistory.push({ id: uid("lh"), advisor_id: advisorId, from_level_id: a.level_id, to_level_id: levelId, changed_by: ops.id, reason, changed_at: new Date().toISOString() });
    a.level_id = levelId;
    save();
  },
  async listLevelHistory(advisorId) {
    return wait(visible(load().levelHistory, advisorId).slice().sort((a, b) => b.changed_at.localeCompare(a.changed_at)));
  },

  async listLeads() {
    return wait(visible(load().leads).slice().sort((a, b) => b.lead_date.localeCompare(a.lead_date)));
  },
  async createLead(input) {
    const p = me();
    if (p.role !== "advisor") throw new Error("Only advisors log leads");
    const l = { ...input, id: uid("l"), advisor_id: p.id, created_at: new Date().toISOString() };
    load().leads.push(l);
    save();
    return wait(l);
  },
};

/** Clears local demo data (used by the "Reset demo data" link). */
export function resetMockData() {
  memory = null;
  try { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
