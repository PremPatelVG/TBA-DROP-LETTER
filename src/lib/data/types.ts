/** master > operations > advisor. Master can do everything operations can, plus manage operations accounts. */
export type Role = "advisor" | "operations" | "master";
export const isAdminRole = (r: Role) => r === "operations" || r === "master";
export type ResponseType = "call" | "email" | "none";

/**
 * A franchise region an operations account is assigned to: either one city (e.g. "Rajkot") or a whole state
 * (e.g. "Gujarat", which covers every city in it). The master picks one when creating the account.
 */
export type OpsScopeType = "city" | "state";

/** A person on the access list. Everyone signs in with `email` — email+password or Google (same identity). */
export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  /** Account email, lower-case (the sign-in identity for both Google and email/password). Only listed emails can use the app. */
  email: string;
  advisor_code: string | null;
  /**
   * Advisor address. `city` and `state` are also the franchise region keys: a city-scoped operations account
   * sees advisors (and drops) whose `city` matches it, a state-scoped one sees everyone whose `state` matches.
   */
  city: string | null;
  state: string | null;
  /** Advisor postal code (optional). */
  zip: string | null;
  /** Operations accounts only: the kind of region assigned (a single city or a whole state); null otherwise. */
  scope_type: OpsScopeType | null;
  /** Operations accounts only: the assigned city or state name; null for master (unrestricted) and advisors. */
  scope_value: string | null;
  active: boolean;
  created_at: string;
};

/** One drop entry = one letter left at one office. Fields in the order the advisor fills them. */
export type DropInput = {
  office_number: string; // e.g. "301-302"
  company_name: string;
  building_name: string;
  block_no: string; // e.g. "1" or "A"
  area: string | null;
  city: string | null;
  full_address: string | null;
  drop_date: string; // YYYY-MM-DD
};

export type DropResponse = {
  responded: boolean;
  response_type: ResponseType;
  response_date: string | null;
  response_notes: string | null;
  /** Contact of the person who responded. At least one is required when responded is true. */
  response_phone: string | null;
  response_email: string | null;
};

export type Drop = DropInput & DropResponse & {
  id: string;
  advisor_id: string;
  created_at: string;
  /**
   * The creating advisor's city and state, denormalized onto the drop so a city- or state-scoped operations
   * account can query and rule-check its drops efficiently. Separate from the drop's own `city`/`full_address`
   * (where the letter was left), which are unchanged.
   */
  region_city: string | null;
  region_state: string | null;
};

/**
 * Filters for finding drops. Advisors only ever get their own drops.
 * `q` matches the start of words in the office number, company name and building name.
 */
export type DropFilter = {
  advisorId?: string;
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  q?: string;
  city?: string;
  building?: string;
  /**
   * Response-status filter: true = only letters the company responded to, false = only those not yet
   * responded to (pending). Left out = both. (`responded` is a flag on each drop; see {@link DropResponse}.)
   */
  responded?: boolean;
  /**
   * Contact-method filter, matched against each drop's `response_type`: "call" or "email" (a responded
   * letter), or "none" (a letter not yet responded to). Left out = any method. Combines with `responded`.
   */
  method?: ResponseType;
};

/** Opaque position for "show more"; pass back what the previous page returned. */
export type Cursor = unknown;
export type DropPage = { rows: Drop[]; cursor: Cursor | null };
export type DropCounts = { letters: number; responses: number };

export type AdvisorSummary = { letters: number; responses: number; buildings: number; weekLetters: number };
export type MonthRow = { key: string; label: string; letters: number; responses: number };
export type OpsSummary = {
  letters: number;
  responses: number;
  buildings: number;
  months: MonthRow[];
  perAdvisor: Record<string, AdvisorSummary>;
};
export type BuildingRef = { name: string; city: string | null };

/** One advisor's standing for the belt leaderboard: their entry count in the given week. */
export type LeaderboardRow = {
  advisorId: string;
  full_name: string;
  advisor_code: string | null;
  city: string | null;
  state: string | null;
  /** Number of drop entries in the week (entries this week; one entry is one letter). */
  weekEntries: number;
};

export type LeadInput = {
  contact_name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  lead_date: string;
  drop_id: string | null;
};
export type Lead = LeadInput & { id: string; advisor_id: string; created_at: string };

/** `password` is the initial sign-in password the admin sets; the account is provisioned in Firebase Auth with it. */
export type NewOpsUser = { full_name: string; email: string; scope_type: OpsScopeType; scope_value: string; password: string };
export type NewAdvisor = { full_name: string; advisor_code: string; email: string; city: string; state: string; zip: string | null; password: string };

/** Outcome of signing in. Only people on the access list who are active get `ok`. */
export type AccessResult =
  | { status: "ok"; profile: Profile }
  | { status: "not_authorised"; email: string | null; reason: "not_listed" | "deactivated" }
  | { status: "cancelled" }
  | { status: "redirecting" };

/** A Google account offered by the demo sign-in (demo data only). `password` is shown so the email+password flow can be tried. */
export type DemoAccount = { email: string; name: string; note: string; password: string };

/**
 * Everything the UI needs from the back end. `mock.ts` implements it with in-browser demo data;
 * `firebase.ts` implements it with Firebase Auth (Google and email/password sign-in) and Firestore. Pick one in `index.ts`.
 * Who may see or change what is enforced by the Firestore security rules and imitated by the mock.
 */
export interface DataApi {
  readonly mode: "mock" | "firebase";
  /** The signed-in person's access, once known (including a sign-in returning from a redirect). null = signed out. */
  currentAccess(): Promise<AccessResult | null>;
  /**
   * Google sign-in: a pop-up first, or a full-page redirect when `redirect` is set or pop-ups cannot work
   * (blocked, or an installed iPhone app). The demo data takes the email of a demo account instead.
   */
  signInWithGoogle(opts?: { demoEmail?: string; redirect?: boolean }): Promise<AccessResult>;
  /**
   * Email + password sign-in (Firebase Auth's Email/Password provider). The email is the identity, the same one
   * used for Google and on the access list. Rejects with a friendly message for a wrong password or unknown email.
   */
  signInWithPassword(email: string, password: string): Promise<AccessResult>;
  /** Sends a password-reset email (Firebase Auth). Resolves even for an unknown email, so it reveals nothing. */
  sendPasswordReset(email: string): Promise<void>;
  /** Refuses (with a message) while entries saved offline are still waiting to sync. */
  signOut(): Promise<void>;
  /** Demo data only: the Google accounts offered on the sign-in screen. */
  demoAccounts(): Promise<DemoAccount[]>;
  /** Changes saved offline that the server later refused. Returns an unsubscribe function. */
  subscribeSyncErrors(onError: (message: string) => void): () => void;

  listAdvisors(): Promise<Profile[]>;
  createAdvisor(input: NewAdvisor): Promise<Profile>;
  /** Master only. */
  listOpsUsers(): Promise<Profile[]>;
  createOpsUser(input: NewOpsUser): Promise<Profile>;
  /** Master: operations accounts. Operations or master: advisors. Deactivated people cannot sign in. */
  setUserActive(id: string, active: boolean): Promise<void>;
  /**
   * Reset the password of a user the caller manages (master: any operations account or advisor; an operations
   * account: advisors in its own region only). Sets the new password in Firebase Auth; see {@link canResetPassword}.
   */
  resetUserPassword(id: string, newPassword: string): Promise<void>;

  /** Newest first. Returns up to `limit` rows and a cursor for the next page (null when there are no more). */
  findDrops(filter: DropFilter, page: { limit: number; cursor?: Cursor | null }): Promise<DropPage>;
  /** Letters and responses matching the filter, or null when they can't be counted exactly (see firebase.ts). */
  countDrops(filter: DropFilter): Promise<DropCounts | null>;
  getDrop(id: string): Promise<Drop | null>;
  /** Saved on the device first; with Firebase it syncs when there is signal. */
  createDrop(input: DropInput): Promise<Drop>;
  updateDropResponse(id: string, r: DropResponse): Promise<void>;
  /** Buildings with drops, for filters (advisors: their own). */
  listBuildings(): Promise<BuildingRef[]>;

  /** Dashboard numbers for one advisor (advisors: themselves). `week` is the current competition week (Monday 09:00 to Monday 09:00, IST). */
  advisorSummary(advisorId: string, week: { start: string; end: string }): Promise<AdvisorSummary | null>;
  /** Operations dashboard: totals, the last six months and one row per advisor. */
  opsSummary(week: { start: string; end: string }, advisorIds: string[]): Promise<OpsSummary | null>;
  /**
   * Belt leaderboard: every advisor's entry count in `week`, for ranking by belt. Any signed-in user may
   * read it (advisors included, so the advisor dashboard can show the leaderboard with their own row marked).
   */
  beltLeaderboard(week: { start: string; end: string }): Promise<LeaderboardRow[]>;

  listLeads(): Promise<Lead[]>;
  createLead(input: LeadInput): Promise<Lead>;
}
