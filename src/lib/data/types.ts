/** master > operations > advisor. Master can do everything operations can, plus manage operations accounts. */
export type Role = "advisor" | "operations" | "master";
export const isAdminRole = (r: Role) => r === "operations" || r === "master";
export type ResponseType = "call" | "email" | "none";

/** A person on the access list. Everyone signs in with Google using `email`. */
export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  /** Google account email, lower-case. Only listed emails can use the app. */
  email: string;
  advisor_code: string | null;
  region: string | null;
  level_id: number | null;
  active: boolean;
  created_at: string;
};

export type Level = { id: number; name: string; target_letters: number; sort_order: number };

export type LevelChange = {
  id: string;
  advisor_id: string;
  from_level_id: number | null;
  to_level_id: number;
  /** Profile id of the person who changed it, or "weekly-job" for automatic changes. */
  changed_by: string | null;
  reason: string | null;
  changed_at: string;
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

export type Drop = DropInput & DropResponse & { id: string; advisor_id: string; created_at: string };

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
  region: string | null;
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

export type NewOpsUser = { full_name: string; email: string };
export type NewAdvisor = { full_name: string; advisor_code: string; region: string; email: string };

/** Outcome of signing in. Only people on the access list who are active get `ok`. */
export type AccessResult =
  | { status: "ok"; profile: Profile }
  | { status: "not_authorised"; email: string | null; reason: "not_listed" | "deactivated" }
  | { status: "cancelled" }
  | { status: "redirecting" };

/** A Google account offered by the demo sign-in (demo data only). */
export type DemoAccount = { email: string; name: string; note: string };

/**
 * Everything the UI needs from the back end. `mock.ts` implements it with in-browser demo data;
 * `firebase.ts` implements it with Firebase Auth (Google sign-in) and Firestore. Pick one in `index.ts`.
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

  /** Dashboard numbers for one advisor (advisors: themselves). `week` is the current competition week (Sunday noon to Sunday noon, IST). */
  advisorSummary(advisorId: string, week: { start: string; end: string }): Promise<AdvisorSummary | null>;
  /** Operations dashboard: totals, the last six months and one row per advisor. */
  opsSummary(week: { start: string; end: string }, advisorIds: string[]): Promise<OpsSummary | null>;
  /**
   * Belt leaderboard: every advisor's entry count in `week`, for ranking by belt. Any signed-in user may
   * read it (advisors included, so the advisor dashboard can show the leaderboard with their own row marked).
   */
  beltLeaderboard(week: { start: string; end: string }): Promise<LeaderboardRow[]>;

  listLevels(): Promise<Level[]>;
  updateLevelTarget(id: number, target: number): Promise<void>;
  changeAdvisorLevel(advisorId: string, levelId: number, reason: string | null): Promise<void>;
  listLevelHistory(advisorId?: string): Promise<LevelChange[]>;

  listLeads(): Promise<Lead[]>;
  createLead(input: LeadInput): Promise<Lead>;
}
