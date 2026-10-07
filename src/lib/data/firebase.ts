import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as take,
  orderBy,
  query,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  waitForPendingWrites,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QueryConstraint,
} from "firebase/firestore";
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as authSignOut,
  type User,
} from "firebase/auth";
import { clearLocalData, clientAuth, clientDb } from "@/lib/firebase/client";
import {
  claimAccess,
  createAdvisor as createAdvisorAction,
  createOpsUser as createOpsUserAction,
  setUserActive as setUserActiveAction,
  type ActionResult,
  type ClaimResult,
} from "@/app/actions";
import { buildingKey, cityKey, dropIndexTokens, matchesDropSearch, matchesPlace, MAX_TOKEN_LENGTH, queryToken, searchTerms } from "@/lib/search";
import { lastMonths } from "@/lib/stats";
import { responseContactError } from "@/lib/validate";
import type { AccessResult, AdvisorSummary, BuildingRef, DataApi, Drop, DropFilter, Lead, LeaderboardRow, Profile } from "./types";

/*
 * Firebase implementation of the data layer: Google sign-in (Firebase Auth) and Firestore.
 * Who may read or write what is enforced by firestore.rules; this file only asks for what the rules allow.
 *
 * Collections: users (the access list), drops, direct_leads, buildings (one per advisor and building, for
 * filters and "buildings covered"), weekly_results (the weekly belt snapshot, written by the scheduled job).
 *
 * Search: every drop stores `search_tokens` (see src/lib/search.ts). A query can use one array-contains,
 * so Firestore gets the longest search word (or the building, or the city) and any other words or filters
 * are checked here. Counts are then not exact, and countDrops returns null.
 */

const code = (e: unknown) => (typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "");
const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === "string" ? v : new Date().toISOString());
const offline = (e: unknown) => ["unavailable", "failed-precondition", "deadline-exceeded"].includes(code(e)) || (typeof navigator !== "undefined" && !navigator.onLine);

// ---------- signed-in person ----------

let me: Profile | null = null;
const PROFILE_KEY = (uid: string) => `tba.profile.${uid}`;
function remember(uid: string, p: Profile) {
  me = p;
  try { localStorage.setItem(PROFILE_KEY(uid), JSON.stringify(p)); } catch { /* private mode */ }
}
function remembered(uid: string): Profile | null {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY(uid)) ?? "null"); } catch { return null; }
}
function forget(uid: string | undefined) {
  me = null;
  try { if (uid) localStorage.removeItem(PROFILE_KEY(uid)); } catch { /* ignore */ }
}
function profile(): Profile {
  if (!me) throw new Error("Not signed in.");
  return me;
}
async function idToken() {
  const u = clientAuth().currentUser;
  if (!u) throw new Error("Not signed in.");
  return u.getIdToken();
}
/** Unwraps a server action result. */
function unwrap<T>(r: ActionResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

function toProfile(snap: DocumentSnapshot): Profile {
  const d = snap.data() ?? {};
  return {
    id: snap.id, role: d.role, full_name: d.full_name ?? "", email: d.email ?? "", advisor_code: d.advisor_code ?? null,
    region: d.region ?? null, active: d.active === true, created_at: iso(d.created_at),
  };
}

let authReady: Promise<void> | null = null;
let redirectOutcome: AccessResult | null = null;
let redirectFailure: string | null = null;
/** Waits for the saved sign-in to load, and picks up the result of a redirect sign-in once. */
function ready() {
  return (authReady ??= (async () => {
    inAndroidApp(); // note it before any page change drops the referrer
    const auth = clientAuth();
    try {
      const r = await getRedirectResult(auth);
      if (r) redirectOutcome = await resolveAccess(r.user, true);
    } catch (e) {
      redirectOutcome = authError(e);
      if (!redirectOutcome) {
        console.error("Redirect sign-in failed", e);
        redirectFailure = e instanceof Error ? e.message : String(e);
      }
    }
    await auth.authStateReady();
  })());
}

function authError(e: unknown): AccessResult | null {
  const c = code(e);
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request" || c === "auth/user-cancelled") return { status: "cancelled" };
  if (c === "auth/user-disabled") {
    const email = (e as { customData?: { email?: string } }).customData?.email ?? null;
    return { status: "not_authorised", email, reason: "deactivated" };
  }
  return null;
}

/** Works out what a signed-in Firebase user may do: their access entry, or "not authorised". */
async function resolveAccess(user: User, justSignedIn: boolean): Promise<AccessResult> {
  let claims: Record<string, unknown> | null = null;
  try {
    claims = (await user.getIdTokenResult()).claims;
  } catch {
    // offline with an expired token: fall back to what this device knew
  }
  const pid = typeof claims?.pid === "string" ? claims.pid : !claims && !justSignedIn ? remembered(user.uid)?.id ?? null : null;
  if (!pid) return claim(user);
  try {
    const snap = await getDoc(doc(clientDb(), "users", pid));
    if (!snap.exists()) return claim(user);
    const p = toProfile(snap);
    if (!p.active || (claims && claims.role !== p.role)) return claim(user);
    remember(user.uid, p);
    return { status: "ok", profile: p };
  } catch (e) {
    // The rules refuse inactive or changed entries: ask the server, which also signs them out properly.
    if (code(e) === "permission-denied") return claim(user);
    const cached = remembered(user.uid);
    if (cached && offline(e)) {
      me = cached;
      return { status: "ok", profile: cached };
    }
    throw e;
  }
}

async function claim(user: User): Promise<AccessResult> {
  let res: ClaimResult;
  try {
    res = await claimAccess(await user.getIdToken());
  } catch (e) {
    throw new Error(offline(e) ? "You are offline. Connect to the internet to sign in." : "Could not reach the server. Please try again.");
  }
  if (res.status === "ok") {
    if (res.claimsChanged) await user.getIdToken(true); // the security rules read the new role from the token
    remember(user.uid, res.profile);
    return { status: "ok", profile: res.profile };
  }
  forget(user.uid);
  await authSignOut(clientAuth()).catch(() => {});
  if (res.status === "error") throw new Error(res.message);
  return res;
}

/**
 * Emulator builds only (NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true): the end-to-end test sets
 * window.__E2E_GOOGLE_ACCOUNT to sign in as a made-up Google account without the pop-up window.
 * The Auth emulator accepts such credentials; real Firebase Auth does not, and production builds drop this code.
 */
function emulatorTestAccount(): { email: string; name: string } | null {
  if (process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true") return null;
  return (window as { __E2E_GOOGLE_ACCOUNT?: { email: string; name: string } }).__E2E_GOOGLE_ACCOUNT ?? null;
}

/**
 * Where a pop-up's result cannot come back, sign in with a redirect instead: the installed iPhone/iPad app, the
 * Android app (a Trusted Web Activity, which Chrome opens with an android-app:// referrer) and the installed web
 * app on Android. Redirect sign-in needs authDomain set to the app's own domain (README, go-live step 9).
 */
function popupUnsupported() {
  if (typeof window === "undefined") return false;
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  if (inAndroidApp()) return true;
  const installed = ["standalone", "fullscreen"].some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches);
  return installed && /Android/i.test(navigator.userAgent);
}

/** True in the Android app. The referrer is only there on the first page load, so it is kept for the session. */
function inAndroidApp() {
  try {
    if (document.referrer.startsWith("android-app://")) sessionStorage.setItem("tba.androidApp", "1");
    return sessionStorage.getItem("tba.androidApp") === "1";
  } catch {
    return false; // storage blocked
  }
}

// ---------- writes that also work offline ----------

type SyncListener = (message: string) => void;
const syncListeners = new Set<SyncListener>();
const refusal = (e: unknown) =>
  code(e) === "permission-denied"
    ? "The server refused this change. Your access may have changed: sign out and sign in again."
    : e instanceof Error ? e.message : String(e);

/**
 * Firestore saves a write on the device at once and confirms it when the server has it, which can be much
 * later without signal. Wait briefly for that confirmation so rule errors show on the form; after that (or
 * straight away when offline) report success and let the write sync on its own.
 */
function settle(write: Promise<unknown>): Promise<void> {
  const wait = typeof navigator !== "undefined" && !navigator.onLine ? 0 : 4000;
  return new Promise((resolve, reject) => {
    let answered = false;
    const timer = setTimeout(() => { answered = true; resolve(); }, wait);
    write.then(
      () => { if (!answered) { answered = true; clearTimeout(timer); resolve(); } },
      (e) => {
        if (!answered) { answered = true; clearTimeout(timer); reject(new Error(refusal(e))); }
        else syncListeners.forEach((l) => l(`An entry saved offline could not be synced: ${refusal(e)}`));
      },
    );
  });
}

// ---------- drops ----------

const ORDER = [orderBy("drop_date", "desc"), orderBy("created_at", "desc")];
const SCAN_BATCH = 200;
const SCAN_LIMIT = 3000;

function toDrop(snap: DocumentSnapshot): Drop {
  const d = snap.data({ serverTimestamps: "estimate" }) ?? {};
  return {
    id: snap.id, advisor_id: d.advisor_id, office_number: d.office_number, company_name: d.company_name, building_name: d.building_name,
    block_no: d.block_no, area: d.area ?? null, city: d.city ?? null, full_address: d.full_address ?? null, drop_date: d.drop_date,
    responded: d.responded === true, response_type: d.response_type ?? "none", response_date: d.response_date ?? null,
    response_notes: d.response_notes ?? null, response_phone: d.response_phone ?? null, response_email: d.response_email ?? null,
    created_at: iso(d.created_at),
  };
}

/**
 * Turns a filter into a Firestore query. Advisors always query their own drops (the rules require it).
 * `exact` is false when some of the filter has to be checked in the app (then counts are not available).
 */
function planDrops(f: DropFilter, extra: QueryConstraint[] = []) {
  const p = profile();
  const advisorId = p.role === "advisor" ? p.id : f.advisorId || null;
  const terms = searchTerms(f.q);
  const word = queryToken(f.q);
  const place = f.building ? `b:${buildingKey(f.building)}` : f.city && cityKey(f.city) ? `c:${cityKey(f.city)}` : null;
  const token = word ?? place;
  const exact = !word || (terms.length === 1 && terms[0].length <= MAX_TOKEN_LENGTH && !place);
  // Field order matches firestore.indexes.json: advisor_id, responded, search_tokens, drop_date, created_at.
  const cs: QueryConstraint[] = [];
  if (advisorId) cs.push(where("advisor_id", "==", advisorId));
  cs.push(...extra);
  if (token) cs.push(where("search_tokens", "array-contains", token));
  if (f.from) cs.push(where("drop_date", ">=", f.from));
  if (f.to) cs.push(where("drop_date", "<=", f.to));
  return {
    query: (...more: QueryConstraint[]) => query(collection(clientDb(), "drops"), ...cs, ...ORDER, ...more),
    exact,
    keep: (d: Drop) => matchesDropSearch(d, f.q) && matchesPlace(d, f),
  };
}

const count = async (q: Query<DocumentData>) => (await getCountFromServer(q)).data().count;

// ---------- the API ----------

export const firebaseApi: DataApi = {
  mode: "firebase",

  async currentAccess() {
    await ready();
    if (redirectFailure) {
      const message = redirectFailure;
      redirectFailure = null;
      throw new Error(`Sign-in did not finish: ${message}`);
    }
    if (redirectOutcome) {
      const r = redirectOutcome;
      redirectOutcome = null;
      return r;
    }
    const user = clientAuth().currentUser;
    if (!user) {
      me = null;
      return null;
    }
    return resolveAccess(user, false);
  },

  async signInWithGoogle(opts) {
    await ready();
    const auth = clientAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const testAccount = emulatorTestAccount();
    if (testAccount) {
      const token = JSON.stringify({ sub: `google-${testAccount.email}`, email: testAccount.email, email_verified: true, name: testAccount.name });
      return resolveAccess((await signInWithCredential(auth, GoogleAuthProvider.credential(token))).user, true);
    }
    if (opts?.redirect || popupUnsupported()) {
      await signInWithRedirect(auth, provider); // leaves the page; currentAccess() picks up the result
      return { status: "redirecting" };
    }
    try {
      const cred = await signInWithPopup(auth, provider);
      return await resolveAccess(cred.user, true);
    } catch (e) {
      const c = code(e);
      if (c === "auth/popup-blocked" || c === "auth/operation-not-supported-in-this-environment" || c === "auth/web-storage-unsupported") {
        await signInWithRedirect(auth, provider);
        return { status: "redirecting" };
      }
      const outcome = authError(e);
      if (outcome) return outcome;
      throw e;
    }
  },

  async signOut() {
    const auth = clientAuth();
    const db = clientDb();
    // Entries saved without signal live only on this phone until they sync: do not throw them away.
    const synced = await Promise.race([waitForPendingWrites(db).then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 3000))]);
    if (!synced) throw new Error("Some entries have not synced yet. Connect to the internet, wait a moment, then sign out.");
    const uid = auth.currentUser?.uid;
    await authSignOut(auth);
    forget(uid);
    await clearLocalData();
  },

  async demoAccounts() {
    return [];
  },

  subscribeSyncErrors(onError) {
    syncListeners.add(onError);
    return () => { syncListeners.delete(onError); };
  },

  // ----- people (access list) -----

  async listAdvisors() {
    const snap = await getDocs(query(collection(clientDb(), "users"), where("role", "==", "advisor")));
    return snap.docs.map(toProfile).sort((a, b) => (a.advisor_code ?? "").localeCompare(b.advisor_code ?? ""));
  },
  async createAdvisor(input) {
    return unwrap(await createAdvisorAction(await idToken(), input));
  },
  async listOpsUsers() {
    const snap = await getDocs(query(collection(clientDb(), "users"), where("role", "==", "operations")));
    return snap.docs.map(toProfile).sort((a, b) => a.full_name.localeCompare(b.full_name));
  },
  async createOpsUser(input) {
    return unwrap(await createOpsUserAction(await idToken(), input));
  },
  async setUserActive(id, active) {
    unwrap(await setUserActiveAction(await idToken(), id, active));
  },

  // ----- drops -----

  async findDrops(f, { limit, cursor }) {
    const plan = planDrops(f);
    const after = (cursor as DocumentSnapshot | null | undefined) ?? null;
    if (plan.exact) {
      const snap = await getDocs(plan.query(...(after ? [startAfter(after)] : []), take(limit + 1)));
      return { rows: snap.docs.slice(0, limit).map(toDrop), cursor: snap.docs.length > limit ? snap.docs[limit - 1] : null };
    }
    // Some words or filters are checked here: read batches until the page is full (or enough has been read).
    const rows: Drop[] = [];
    let last = after;
    for (let scanned = 0; scanned < SCAN_LIMIT; ) {
      const snap = await getDocs(plan.query(...(last ? [startAfter(last)] : []), take(SCAN_BATCH)));
      for (let i = 0; i < snap.docs.length; i++) {
        last = snap.docs[i];
        scanned++;
        const d = toDrop(last);
        if (plan.keep(d) && rows.push(d) === limit) {
          const end = snap.docs.length < SCAN_BATCH && i === snap.docs.length - 1;
          return { rows, cursor: end ? null : last };
        }
      }
      if (snap.docs.length < SCAN_BATCH) return { rows, cursor: null };
    }
    return { rows, cursor: last };
  },

  async countDrops(f) {
    const plan = planDrops(f);
    if (!plan.exact) return null;
    const responded = planDrops(f, [where("responded", "==", true)]);
    try {
      const [letters, responses] = await Promise.all([count(plan.query()), count(responded.query())]);
      return { letters, responses };
    } catch (e) {
      if (offline(e)) return null;
      throw e;
    }
  },

  async getDrop(id) {
    try {
      const snap = await getDoc(doc(clientDb(), "drops", id));
      return snap.exists() ? toDrop(snap) : null;
    } catch (e) {
      if (code(e) === "permission-denied") return null;
      throw e;
    }
  },

  async createDrop(input) {
    const p = profile();
    if (p.role !== "advisor") throw new Error("Only advisors log drops.");
    const db = clientDb();
    const ref = doc(collection(db, "drops"));
    const created = Timestamp.now();
    const fields = {
      ...input, advisor_id: p.id,
      responded: false, response_type: "none" as const, response_date: null, response_notes: null, response_phone: null, response_email: null,
    };
    // One small document per advisor and building, for the building filter and "buildings covered".
    const key = buildingKey(input.building_name);
    const building = setDoc(doc(db, "buildings", `${p.id}__${key}`), {
      advisor_id: p.id, key, name: input.building_name,
      ...(input.city ? { city: input.city, city_key: cityKey(input.city) } : {}),
    }, { merge: true });
    building.catch(() => {}); // if access is the problem, the drop write below reports it
    await settle(setDoc(ref, { ...fields, created_at: created, search_tokens: dropIndexTokens(input) }));
    return { ...fields, id: ref.id, created_at: created.toDate().toISOString() };
  },

  async updateDropResponse(id, r) {
    const contact = responseContactError(r.responded, r.response_phone ?? "", r.response_email ?? "");
    if (contact) throw new Error(contact.message);
    await settle(updateDoc(doc(clientDb(), "drops", id), { ...r }));
  },

  async listBuildings() {
    const p = profile();
    const c = collection(clientDb(), "buildings");
    const snap = await getDocs(p.role === "advisor" ? query(c, where("advisor_id", "==", p.id)) : c);
    return uniqueBuildings(snap.docs.map((d) => d.data()));
  },

  // ----- dashboards (count queries: about one read per 1,000 entries counted) -----

  async advisorSummary(advisorId, week) {
    const p = profile();
    const id = p.role === "advisor" ? p.id : advisorId;
    try {
      return await summaryFor(id, week);
    } catch (e) {
      if (offline(e)) return null;
      throw e;
    }
  },

  async opsSummary(week, advisorIds) {
    const db = clientDb();
    const drops = collection(db, "drops");
    try {
      const months = lastMonths(6);
      const [letters, responses, buildings, monthRows, perAdvisor] = await Promise.all([
        count(query(drops, ...ORDER)),
        count(query(drops, where("responded", "==", true), ...ORDER)),
        getDocs(collection(db, "buildings")).then((s) => uniqueBuildings(s.docs.map((d) => d.data())).length),
        Promise.all(months.map(async (m) => {
          const range = [where("drop_date", ">=", m.start), where("drop_date", "<=", m.end)];
          const [l, r] = await Promise.all([
            count(query(drops, ...range, ...ORDER)),
            count(query(drops, where("responded", "==", true), ...range, ...ORDER)),
          ]);
          return { key: m.key, label: m.label, letters: l, responses: r };
        })),
        Promise.all(advisorIds.map(async (id) => [id, await summaryFor(id, week)] as const)),
      ]);
      return { letters, responses, buildings, months: monthRows, perAdvisor: Object.fromEntries(perAdvisor) };
    } catch (e) {
      if (offline(e)) return null;
      throw e;
    }
  },

  async beltLeaderboard(week) {
    // Each advisor's entry count for the week: one count query per advisor (about one read per 1,000 entries).
    // Advisors may read advisor profiles but, per the security rules, only their own drops; if a count query
    // is refused for an advisor the dashboard catches it and shows just their own belt.
    const db = clientDb();
    const drops = collection(db, "drops");
    const advisors = await getDocs(query(collection(db, "users"), where("role", "==", "advisor")));
    return Promise.all(
      advisors.docs.map(async (snap): Promise<LeaderboardRow> => {
        const p = toProfile(snap);
        const weekEntries = await count(query(drops, where("advisor_id", "==", p.id), where("drop_date", ">=", week.start), where("drop_date", "<=", week.end), ...ORDER));
        return { advisorId: p.id, full_name: p.full_name, advisor_code: p.advisor_code, region: p.region, weekEntries };
      }),
    );
  },

  // ----- direct leads -----

  async listLeads() {
    const p = profile();
    const c = collection(clientDb(), "direct_leads");
    const snap = await getDocs(p.role === "advisor"
      ? query(c, where("advisor_id", "==", p.id), orderBy("lead_date", "desc"), take(200))
      : query(c, orderBy("lead_date", "desc"), take(200)));
    return snap.docs.map((d): Lead => {
      const x = d.data();
      return { id: d.id, advisor_id: x.advisor_id, contact_name: x.contact_name, company_name: x.company_name ?? null, phone: x.phone ?? null, email: x.email ?? null, notes: x.notes ?? null, lead_date: x.lead_date, drop_id: x.drop_id ?? null, created_at: iso(x.created_at) };
    });
  },
  async createLead(input) {
    const p = profile();
    if (p.role !== "advisor") throw new Error("Only advisors log leads.");
    const ref = doc(collection(clientDb(), "direct_leads"));
    const created = Timestamp.now();
    await settle(setDoc(ref, { ...input, advisor_id: p.id, created_at: created }));
    return { ...input, id: ref.id, advisor_id: p.id, created_at: created.toDate().toISOString() };
  },
};

/** Letters, responses, buildings and this week's letters for one advisor: four count queries. */
async function summaryFor(id: string, week: { start: string; end: string }): Promise<AdvisorSummary> {
  const db = clientDb();
  const drops = collection(db, "drops");
  const mine = where("advisor_id", "==", id);
  const [letters, responses, weekLetters, buildings] = await Promise.all([
    count(query(drops, mine, ...ORDER)),
    count(query(drops, mine, where("responded", "==", true), ...ORDER)),
    count(query(drops, mine, where("drop_date", ">=", week.start), where("drop_date", "<=", week.end), ...ORDER)),
    count(query(collection(db, "buildings"), where("advisor_id", "==", id))),
  ]);
  return { letters, responses, buildings, weekLetters };
}

/** Building documents are per advisor; the same building visited by two advisors counts once. */
function uniqueBuildings(docs: DocumentData[]): BuildingRef[] {
  const seen = new Map<string, BuildingRef>();
  for (const b of docs) {
    const prev = seen.get(b.key);
    if (!prev || (!prev.city && b.city)) seen.set(b.key, { name: b.name, city: b.city ?? null });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
