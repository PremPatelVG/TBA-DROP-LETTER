import { buildingKey, matchesDropSearch, matchesPlace, matchesResponse, responseStatusOf } from "@/lib/search";
import { lastMonths, totals } from "@/lib/stats";
import { isIndianPhone, normaliseResponse, passwordError } from "@/lib/validate";
import { beltThresholdsError, DEFAULT_BELT_THRESHOLDS } from "@/lib/belts";
import { regionalTitle, scopeLabel } from "@/lib/labels";
import { buildRegionalWelcomeEmail, buildWelcomeEmail, DEFAULT_MAIL_FROM } from "@/lib/email";
import { buildSeed, DEMO_PASSWORD, DEMO_UNLISTED, MOCK_VERSION, type MockDb } from "./mock-seed";
import { accessFor, canCreateAdvisor, canEditAccount, canManageRegionalAccount, canManageRegionalAccounts, canResendWelcome, canResetPassword, canSetUserActive, passwordSignIn } from "./authz";
import { isAdminRole, type AccessResult, type DataApi, type Drop, type DropFilter, type Profile, type WelcomeEmailPreview, type WelcomeEmailResult } from "./types";

// Versioned key: bumping it leaves old browser data behind and loads fresh sample data.
const DB_KEY = "tba.mock.db.v13";
const OLD_KEYS = ["tba.mock.db", "tba.mock.db.v3", "tba.mock.db.v4", "tba.mock.db.v5", "tba.mock.db.v6", "tba.mock.db.v7", "tba.mock.db.v8", "tba.mock.db.v9", "tba.mock.db.v10", "tba.mock.db.v11"];
const SESSION_KEY = "tba.mock.session.email";

/**
 * Clearly-sample links used only in the demo preview of the welcome emails. The real app reads them from the
 * APP_APK_URL and APP_URL env vars (see `email.server.ts`); the demo sends nothing.
 */
const DEMO_APK_URL = "https://app.tbaindia.in/tba-advisor.apk";
const DEMO_APP_URL = "https://app.tbaindia.in";

/** The demo's preview of the welcome email a person would receive (advisor or regional account). */
function welcomePreview(p: Profile, password: string): WelcomeEmailPreview {
  const links = { apkUrl: DEMO_APK_URL, appUrl: DEMO_APP_URL };
  const body = p.role === "operations"
    ? buildRegionalWelcomeEmail({ name: p.full_name, title: regionalTitle(p.scope_type, p.scope_value), email: p.email, password, ...links })
    : buildWelcomeEmail({ name: p.full_name, advisorId: p.advisor_code ?? "", email: p.email, password, ...links });
  return { from: DEFAULT_MAIL_FROM, to: p.email, ...body };
}

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

/** Same decision as the server's access check: listed and active, by email (Google or password). */
const access = (email: string): AccessResult => accessFor(load().profiles, email);

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

/** A regional account's scope filter for anything carrying a city and state; master/national: no filter. */
function inScope<T>(p: Profile, rows: T[], city: (r: T) => string | null, state: (r: T) => string | null): T[] {
  if (p.role !== "operations") return rows; // master sees every region
  if (p.scope_type === "national") return rows; // national (TBA India Ops) sees every region too
  if (p.scope_type === "state" && p.scope_value) return rows.filter((r) => state(r) === p.scope_value);
  if (p.scope_type === "city" && p.scope_value) return rows.filter((r) => city(r) === p.scope_value);
  return []; // a regional account with no usable scope sees nothing (fail closed)
}
/** Advisors in the signed-in admin's region: a scoped operations account sees its city/state only; master all. */
const advisorsInScope = (p: Profile, advisors: Profile[]) => inScope(p, advisors, (a) => a.city, (a) => a.state);

/** Imitates the security rules for drops: advisors own rows; operations their region (city or state); master all. */
function visibleDrops(rows: Drop[], advisorId?: string): Drop[] {
  const p = me();
  if (p.role === "advisor") return rows.filter((r) => r.advisor_id === p.id);
  const scoped = inScope(p, rows, (d) => d.region_city, (d) => d.region_state);
  return advisorId ? scoped.filter((r) => r.advisor_id === advisorId) : scoped;
}

function filtered(f: DropFilter) {
  return visibleDrops(load().drops, f.advisorId).filter((d) =>
    (!f.from || d.drop_date >= f.from) &&
    (!f.to || d.drop_date <= f.to) &&
    matchesPlace(d, f) &&
    matchesResponse(d, f) &&
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
  async signInWithPassword(email, password) {
    const db = load();
    const res = passwordSignIn(db.profiles, db.passwords, email, password);
    if ("error" in res) throw new Error(res.error); // wrong password or unknown email (same message)
    setSession(res.ok.status === "ok" ? cleanEmail(email) : null);
    return wait(res.ok);
  },
  async sendPasswordReset() {
    // Demo: no email is actually sent. Resolve regardless so the screen shows the same confirmation either way.
    return wait(undefined);
  },
  async signOut() { setSession(null); },
  async demoAccounts() {
    const roleNote = (p: Profile) =>
      p.role === "advisor" ? `Advisor ${p.advisor_code} · ${p.city ?? ""}`
      : p.role === "master" ? "Master · all regions · edits belt thresholds"
      : p.scope_type === "national" ? "TBA India Ops · all regions · adds state/city accounts · no threshold editor"
      : `${regionalTitle(p.scope_type, p.scope_value)} · ${scopeLabel(p.scope_type, p.scope_value)}`;
    const db = load();
    const people = db.profiles.map((p) => ({
      email: p.email,
      name: p.full_name,
      note: `${roleNote(p)}${p.active ? "" : " (deactivated)"}`,
      password: db.passwords[p.email] ?? DEMO_PASSWORD,
    }));
    return wait([...people, DEMO_UNLISTED]);
  },
  subscribeSyncErrors() {
    return () => {}; // demo data is saved in this browser right away; nothing syncs later
  },

  async listAdvisors() {
    const actor = requireOps();
    const advisors = load().profiles.filter((p) => p.role === "advisor");
    return wait(advisorsInScope(actor, advisors).sort((a, b) => (a.advisor_code ?? "").localeCompare(b.advisor_code ?? "")));
  },
  async createAdvisor(input) {
    const actor = requireOps();
    const db = load();
    const code = input.advisor_code.trim().toUpperCase();
    const email = cleanEmail(input.email);
    const pwErr = passwordError(input.password);
    if (pwErr) throw new Error(pwErr);
    if (db.profiles.some((p) => p.advisor_code === code)) throw new Error(`Advisor ID ${code} already exists.`);
    if (db.profiles.some((p) => p.email === email)) throw new Error(`${email} is already on the list.`);
    let city = input.city.trim();
    let state = input.state.trim();
    const zip = input.zip?.trim() || null;
    // A state/city account can only add advisors inside its own region: force the scoped dimension. national adds
    // advisors anywhere (nothing forced); master too.
    if (actor.role === "operations") {
      if (actor.scope_type === "city" && actor.scope_value) city = actor.scope_value;
      else if (actor.scope_type === "state" && actor.scope_value) state = actor.scope_value;
    }
    if (!city) throw new Error("City is required.");
    if (!state) throw new Error("State is required.");
    // The shared who-can-create-what rule (used by the server too): a regional account stays within its scope.
    if (!canCreateAdvisor(actor, { city, state })) throw new Error("You can only add advisors in your own region.");
    const p: Profile = {
      id: uid("u"), role: "advisor", full_name: input.full_name.trim(), email, advisor_code: code,
      city, state, zip, phone: null, scope_type: null, scope_value: null, active: true, created_at: new Date().toISOString(),
    };
    db.profiles.push(p);
    db.passwords[email] = input.password; // demo: the account can now sign in with email + password
    save();
    // Simulate the welcome email (nothing is really sent in the demo) and return it so the admin can preview
    // exactly what the advisor receives: their login, their password, and the app download link.
    const welcomeEmail: WelcomeEmailResult = { status: "preview", preview: welcomePreview(p, input.password) };
    return wait({ profile: p, welcomeEmail });
  },
  async listOpsUsers() {
    const actor = requireOps();
    if (!canManageRegionalAccounts(actor)) throw new Error("You are not allowed to view regional accounts.");
    // Imitates the rules: master sees every regional account; national sees the state and city accounts only.
    return wait(load().profiles.filter((p) => p.role === "operations" && canManageRegionalAccount(actor, p.scope_type)).sort((a, b) => a.full_name.localeCompare(b.full_name)));
  },
  async createOpsUser(input) {
    const actor = requireOps();
    if (!canManageRegionalAccount(actor, input.scope_type)) {
      throw new Error(actor.role === "operations" && actor.scope_type === "national"
        ? "TBA India Ops can add state and city accounts only." : "You are not allowed to add regional accounts.");
    }
    const db = load();
    const email = cleanEmail(input.email);
    const pwErr = passwordError(input.password);
    if (pwErr) throw new Error(pwErr);
    if (db.profiles.some((p) => p.email === email)) throw new Error(`${email} is already on the list.`);
    // national (TBA India Ops) carries no region; state/city need their region named.
    let scope_value: string | null = null;
    if (input.scope_type !== "national") {
      scope_value = input.scope_value.trim();
      if (!scope_value) throw new Error(`${input.scope_type === "state" ? "State" : "City"} is required.`);
    }
    const p: Profile = {
      id: uid("u"), role: "operations", full_name: input.full_name.trim(), email, advisor_code: null,
      city: null, state: null, zip: null, phone: null, scope_type: input.scope_type, scope_value, active: true, created_at: new Date().toISOString(),
    };
    db.profiles.push(p);
    db.passwords[email] = input.password; // demo: the account can now sign in with email + password
    save();
    // Simulated, as for advisors: return the welcome email so the admin can preview what the account receives.
    const welcomeEmail: WelcomeEmailResult = { status: "preview", preview: welcomePreview(p, input.password) };
    return wait({ profile: p, welcomeEmail });
  },
  async setUserActive(id, active) {
    const actor = requireOps();
    const target = load().profiles.find((p) => p.id === id);
    if (!target) throw new Error("User not found");
    if (target.id === actor.id) throw new Error("You cannot deactivate yourself.");
    // Same authorisation as the server: master → anyone they manage; operations → advisors in their region only.
    if (!canSetUserActive(actor, target)) {
      throw new Error(target.role === "advisor" ? "You can only manage advisors in your own region." : "You are not allowed to manage this account.");
    }
    target.active = active;
    save();
  },
  async resetUserPassword(id, newPassword) {
    const actor = requireOps();
    const err = passwordError(newPassword);
    if (err) throw new Error(err);
    const db = load();
    const target = db.profiles.find((p) => p.id === id);
    if (!target) throw new Error("User not found.");
    // Same authorisation as the server: master → anyone they manage; operations → advisors in their region only.
    if (!canResetPassword(actor, target)) throw new Error("You are not allowed to reset this user's password.");
    db.passwords[target.email] = newPassword;
    save();
    return wait(undefined);
  },
  async resendWelcomeEmail(id) {
    const actor = requireOps();
    const db = load();
    const target = db.profiles.find((p) => p.id === id);
    if (!target) throw new Error("User not found.");
    if (target.id === actor.id) throw new Error("You cannot resend your own welcome email.");
    if (!canResendWelcome(actor, target)) throw new Error("You are not allowed to resend this account's welcome email.");
    if (!target.active) throw new Error("Reactivate the account before resending their welcome email.");
    // As on the server: the original password is never kept, so a fresh temporary one is set and emailed.
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    const password = Array.from(bytes, (b) => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 56]).join("") + "7";
    db.passwords[target.email] = password;
    save();
    return wait({ status: "preview", preview: welcomePreview(target, password) } as WelcomeEmailResult);
  },
  async updateAccount(id, input) {
    const actor = requireOps();
    const db = load();
    const target = db.profiles.find((p) => p.id === id);
    if (!target) throw new Error("User not found.");
    // Same rule as the server: whoever already manages the account may edit it (never the master account).
    if (!canEditAccount(actor, target)) throw new Error(target.role === "advisor" ? "You can only edit advisors in your own region." : "You are not allowed to edit this account.");
    const full_name = input.full_name.trim().replace(/\s+/g, " ");
    if (!full_name) throw new Error("Name is required.");
    const phone = input.phone?.trim() || null;
    if (phone && !isIndianPhone(phone)) throw new Error("Phone number: use 10 digits, optionally starting with +91, for example +91 98765 43210.");
    if (target.role === "advisor") {
      let city = (input.city ?? "").trim();
      let state = (input.state ?? "").trim();
      // A state/city account keeps its advisors inside its own region: force the scoped dimension, as on create.
      if (actor.role === "operations") {
        if (actor.scope_type === "city" && actor.scope_value) city = actor.scope_value;
        else if (actor.scope_type === "state" && actor.scope_value) state = actor.scope_value;
      }
      if (!city) throw new Error("City is required.");
      if (!state) throw new Error("State is required.");
      if (!canCreateAdvisor(actor, { city, state })) throw new Error("You can only move advisors within your own region.");
      Object.assign(target, { full_name, phone, city, state, zip: input.zip?.trim() || null });
    } else {
      const patch: Partial<Profile> = { full_name, phone };
      if (target.scope_type === "state" || target.scope_type === "city") {
        const v = (input.scope_value ?? "").trim();
        if (!v) throw new Error(`${target.scope_type === "state" ? "State" : "City"} is required.`);
        patch.scope_value = v;
      }
      Object.assign(target, patch);
    }
    save();
    return wait({ ...target });
  },

  async findDrops(f, { limit, cursor }) {
    const start = typeof cursor === "number" ? cursor : 0;
    const rows = filtered(f).sort(newestFirst);
    const end = start + limit;
    return wait({ rows: rows.slice(start, end), cursor: end < rows.length ? end : null });
  },
  async countDrops(f) {
    const rows = filtered(f);
    return wait({ letters: rows.length, responses: rows.filter((d) => d.responded).length, notInterested: rows.filter((d) => responseStatusOf(d) === "not_interested").length });
  },
  async getDrop(id) { return wait(visibleDrops(load().drops).find((d) => d.id === id) ?? null); },
  async createDrop(input) {
    const p = me();
    if (p.role !== "advisor") throw new Error("Only advisors log drops");
    const d: Drop = {
      ...input, id: uid("d"), advisor_id: p.id, region_city: p.city, region_state: p.state, created_at: new Date().toISOString(),
      response_status: "pending", responded: false, response_type: "none", response_date: null, response_notes: null, response_phone: null, response_email: null,
    };
    load().drops.push(d);
    save();
    return wait(d);
  },
  async updateDropResponse(id, r) {
    const d = visibleDrops(load().drops).find((x) => x.id === id);
    if (!d) throw new Error("Drop not found.");
    // Same rules as the security rules: a responded letter needs the responder's phone number or email; a
    // not-interested one needs a date; the stored shape follows the status.
    const { value, error } = normaliseResponse(r);
    if (error) throw new Error(error);
    Object.assign(d, value);
    save();
    return wait(undefined);
  },
  async listBuildings() {
    const seen = new Map<string, { name: string; city: string | null }>();
    for (const d of visibleDrops(load().drops)) {
      const k = buildingKey(d.building_name);
      if (!seen.has(k) || (!seen.get(k)!.city && d.city)) seen.set(k, { name: d.building_name, city: d.city });
    }
    return wait([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)));
  },

  async advisorSummary(advisorId, week) {
    const rows = visibleDrops(load().drops, advisorId);
    const t = totals(rows);
    return wait({ letters: t.letters, responses: t.responses, notInterested: t.notInterested, buildings: t.buildings, weekLetters: rows.filter((d) => d.drop_date >= week.start && d.drop_date <= week.end).length });
  },
  async opsSummary(week, advisorIds) {
    const actor = requireOps();
    // Totals cover the signed-in account's region: one city, one whole state, or (master) every region.
    const all = inScope(actor, load().drops, (d) => d.region_city, (d) => d.region_state);
    const t = totals(all);
    const months = lastMonths(6).map((m) => {
      const rows = all.filter((d) => d.drop_date >= m.start && d.drop_date <= m.end);
      return { key: m.key, label: m.label, letters: rows.length, responses: rows.filter((d) => d.responded).length };
    });
    const perAdvisor = Object.fromEntries(advisorIds.map((id) => {
      const rows = all.filter((d) => d.advisor_id === id);
      const a = totals(rows);
      return [id, { letters: a.letters, responses: a.responses, notInterested: a.notInterested, buildings: a.buildings, weekLetters: rows.filter((d) => d.drop_date >= week.start && d.drop_date <= week.end).length }];
    }));
    return wait({ letters: t.letters, responses: t.responses, notInterested: t.notInterested, buildings: t.buildings, months, perAdvisor });
  },
  async beltLeaderboard(week) {
    const viewer = me(); // any signed-in user may read the leaderboard (advisors included)
    const db = load();
    // A scoped operations account ranks only its region's advisors; master and advisors see the whole company.
    const advisors = viewer.role === "operations" ? advisorsInScope(viewer, db.profiles.filter((p) => p.role === "advisor")) : db.profiles.filter((p) => p.role === "advisor");
    // "entries this week": each advisor's drops whose drop_date falls in the current competition week.
    // Easy to switch to all-time totals later: drop the drop_date range and count all of the advisor's drops.
    return wait(
      advisors.map((a) => ({
        advisorId: a.id,
        full_name: a.full_name,
        advisor_code: a.advisor_code,
        city: a.city,
        state: a.state,
        weekEntries: db.drops.filter((d) => d.advisor_id === a.id && d.drop_date >= week.start && d.drop_date <= week.end).length,
      })),
    );
  },

  async listLeads() {
    // Imitates the rules: advisors their own; operations their region (region_city/region_state); master all.
    const p = me();
    const rows = p.role === "advisor" ? load().leads.filter((l) => l.advisor_id === p.id) : inScope(p, load().leads, (l) => l.region_city, (l) => l.region_state);
    return wait(rows.slice().sort((a, b) => b.lead_date.localeCompare(a.lead_date)));
  },
  async createLead(input) {
    const p = me();
    if (p.role !== "advisor") throw new Error("Only advisors log leads");
    // Filed in the advisor's own region, like drops, so regional accounts see only their region's leads.
    const l = { ...input, id: uid("l"), advisor_id: p.id, region_city: p.city, region_state: p.state, created_at: new Date().toISOString() };
    load().leads.push(l);
    save();
    return wait(l);
  },

  async getBeltThresholds() {
    me(); // any signed-in user may read the thresholds
    return wait({ ...(load().beltThresholds ?? DEFAULT_BELT_THRESHOLDS) });
  },
  async setBeltThresholds(thresholds) {
    requireMaster(); // only master may edit the thresholds (imitates the security rules)
    const err = beltThresholdsError(thresholds);
    if (err) throw new Error(err);
    const db = load();
    db.beltThresholds = { yellowMin: thresholds.yellowMin, blueMin: thresholds.blueMin, greenMin: thresholds.greenMin };
    save();
    return wait(undefined);
  },
};

/** Clears local demo data (used by the "Reset demo data" link). */
export function resetMockData() {
  memory = null;
  try { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
