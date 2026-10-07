"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { api, USE_MOCK, type AccessResult, type Cursor, type Drop, type DropFilter, type Profile, type Role } from "@/lib/data";
import { ymd } from "@/lib/stats";
import { registerAdvisorServiceWorker } from "@/lib/advisor-offline";

export const inputCls = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-200";
export const btnCls = "inline-flex items-center justify-center rounded-md bg-green-700 px-4 py-2.5 font-medium text-white hover:bg-green-800 disabled:opacity-50";
export const btn2Cls = "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50";
export const cardCls = "rounded-lg border bg-white";

/** Row/card background for a drop: green when a response was received. */
export const dropBg = (responded: boolean) => (responded ? "bg-green-50 border-green-200" : "bg-white");

export const today = () => ymd(new Date());
export const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Loads data from the data layer; `reload` re-runs it. */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load().then((d) => live && setData(d), (e) => live && setError(errMsg(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}

const UserCtx = createContext<Profile | null>(null);
export const useUser = () => {
  const u = useContext(UserCtx);
  if (!u) throw new Error("useUser outside RequireRole");
  return u;
};

const ADMIN_NAV = [
  { href: "/ops", label: "Dashboard" },
  { href: "/ops/drops", label: "All drops" },
  { href: "/ops/advisors", label: "Advisors" },
];
const MASTER_NAV = [{ href: "/master", label: "Operations accounts" }];

const ROLE_LABEL: Record<Role, string> = { advisor: "Advisor", operations: "Operations", master: "Master" };
export const homeFor = (r: Role) => (r === "advisor" ? "/advisor" : "/ops");

/** Where to send someone after a sign-in check; null when they may stay (or nothing is decided yet). */
export function accessRedirect(a: AccessResult | null): string | null {
  if (!a || a.status === "cancelled" || a.status === "redirecting") return "/login";
  if (a.status === "not_authorised") {
    return `/not-authorised?reason=${a.reason}${a.email ? `&email=${encodeURIComponent(a.email)}` : ""}`;
  }
  return null;
}

/**
 * Client-side guard: checks the signed-in person against the access list and redirects if they are signed
 * out, not authorised, or in the wrong part of the app. The security rules enforce the same on the server.
 */
export function RequireRole({ roles, variant, children }: { roles: Role[]; variant: "admin" | "advisor"; children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = roles.join(",");
  useEffect(() => {
    api.currentAccess().then((a) => {
      const to = accessRedirect(a);
      if (to) return router.replace(to);
      const p = (a as Extract<AccessResult, { status: "ok" }>).profile;
      if (!key.split(",").includes(p.role)) router.replace(homeFor(p.role));
      else setUser(p);
    }, (e) => setError(errMsg(e)));
  }, [key, router]);
  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-3 text-center">
          <Notice kind="error">{error}</Notice>
          <div className="flex justify-center gap-2">
            <button className={btn2Cls} onClick={() => location.reload()}>Try again</button>
            <button className={btn2Cls} onClick={() => api.signOut().finally(() => router.replace("/login"))}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }
  if (!user) return <div className="flex min-h-dvh items-center justify-center text-slate-500">Loading...</div>;
  const Shell = variant === "advisor" ? AdvisorShell : AdminShell;
  return <UserCtx.Provider value={user}><Shell user={user}>{children}</Shell></UserCtx.Provider>;
}

function useSignOut() {
  const router = useRouter();
  return async () => {
    try {
      await api.signOut();
      router.replace("/login");
    } catch (e) {
      window.alert(errMsg(e));
    }
  };
}

const subscribeOnline = (l: () => void) => {
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  return () => { window.removeEventListener("online", l); window.removeEventListener("offline", l); };
};
/** False while the device has no connection. */
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/** Offline notice and sync problems, shown above the advisor screens. */
function SyncBanner() {
  const online = useOnline();
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => api.subscribeSyncErrors(setProblem), []);
  return (
    <>
      {!online && (
        <p role="status" className="bg-amber-100 px-4 py-2 text-center text-xs text-amber-900">
          Offline. New entries are saved on this phone and sync when you are back online.
        </p>
      )}
      {problem && (
        <p role="alert" className="flex items-start justify-between gap-3 bg-red-50 px-4 py-2 text-xs text-red-800">
          <span>{problem}</span>
          <button className="shrink-0 underline" onClick={() => setProblem(null)}>Dismiss</button>
        </p>
      )}
    </>
  );
}
const DemoBadge = () => (USE_MOCK ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">DEMO DATA</span> : null);

/** How the signed-in admin's franchise region reads in the header: the master sees everything; an operations
 * account is pinned to one city or one whole state. */
export function regionLabel(user: Pick<Profile, "role" | "scope_type" | "scope_value">): string | null {
  if (user.role === "master") return "All regions";
  if (user.role === "operations" && user.scope_value) return `${user.scope_type === "state" ? "State" : "City"}: ${user.scope_value}`;
  return null;
}

/** Desktop web admin chrome for operations and master. */
function AdminShell({ user, children }: { user: Profile; children: React.ReactNode }) {
  const path = usePathname();
  const signOut = useSignOut();
  const nav = user.role === "master" ? [...ADMIN_NAV, ...MASTER_NAV] : ADMIN_NAV;
  const region = regionLabel(user);
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700">TBA Drop Letter · Admin<DemoBadge /></p>
            <p className="truncate text-sm text-slate-600">{ROLE_LABEL[user.role]} · {user.full_name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {region && (
              <span className="whitespace-nowrap rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800" title="Region you manage">
                {region}
              </span>
            )}
            <button onClick={signOut} className={btn2Cls}>Sign out</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2 text-sm">
          {nav.map((n) => (
            <Link key={n.href} href={n.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 ${n.href === path ? "bg-green-50 font-medium text-green-700" : "text-slate-700 hover:bg-slate-100"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ADVISOR_TABS = [
  { href: "/advisor", label: "Home", icon: icon("M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10") },
  { href: "/advisor/drops/new", label: "New drop", icon: icon("M12 5v14M5 12h14") },
  { href: "/advisor/responses", label: "Log response", icon: icon("M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.35-4.35") },
  { href: "/advisor/leads", label: "Leads", icon: icon("M16 21v-2a4 4 0 00-8 0v2M12 11a4 4 0 100-8 4 4 0 000 8") },
];

/** Mobile app chrome for advisors: compact top bar + fixed bottom tab bar. */
function AdvisorShell({ user, children }: { user: Profile; children: React.ReactNode }) {
  const path = usePathname();
  const signOut = useSignOut();
  const [fromTab, setFromTab] = useState("/advisor");
  // A drop's response form belongs to whichever tab opened it (Home or Log response).
  const onDrop = path === "/advisor/drop";
  const activeTab = (href: string) => (onDrop ? href === fromTab : path === href);
  useEffect(() => {
    if (!onDrop) setFromTab(ADVISOR_TABS.some((t) => t.href === path) ? path : "/advisor");
  }, [onDrop, path]);
  useEffect(registerAdvisorServiceWorker, []);
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-10 bg-green-700 text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Drop Letter<DemoBadge /></p>
            <p className="truncate text-xs text-green-100">{user.full_name} · {user.advisor_code}</p>
          </div>
          <button onClick={signOut} className="rounded-md px-2 py-1 text-xs text-green-100 hover:bg-green-600">Sign out</button>
        </div>
        <SyncBanner />
      </header>
      <main className="mx-auto max-w-lg px-4 pt-4 pb-28">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Advisor">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {ADVISOR_TABS.map((t) => {
            const on = activeTab(t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] leading-tight ${on ? "font-semibold text-green-700" : "text-slate-500"}`}>
                {t.icon}{t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function StatCards({ t, compact = false }: { t: { letters: number; buildings: number; responses: number; rate: number }; compact?: boolean }) {
  const items = [
    ["Letters dropped", t.letters.toLocaleString("en-IN")],
    ["Buildings covered", t.buildings],
    ["Responses", t.responses],
    ["Response rate", `${t.rate}%`],
  ] as const;
  return (
    <div className={`mb-6 grid grid-cols-2 gap-3 ${compact ? "" : "lg:grid-cols-4"}`}>
      {items.map(([label, value]) => (
        <div key={label} className={`${cardCls} p-4`}>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

export function Field({ name, label, required = true, ...rest }: { name: string; label: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium">{label}{required && <span className="text-red-500"> *</span>}
      <input name={name} required={required} className={inputCls} {...rest} />
    </label>
  );
}

const NOTICE = { error: "bg-red-50 text-red-700", ok: "bg-green-50 text-green-800", info: "bg-amber-50 text-amber-900" };
export function Notice({ kind, children }: { kind: keyof typeof NOTICE; children: React.ReactNode }) {
  return <p className={`rounded-md p-3 text-sm ${NOTICE[kind]}`}>{children}</p>;
}

/** Where a drop was left, on one line: "Office 301-302 · Block A · Shivalik Shilp". */
export const dropPlace = (d: Pick<Drop, "office_number" | "block_no" | "building_name">) =>
  `Office ${d.office_number} · Block ${d.block_no} · ${d.building_name}`;

/** Advisor list item for one drop (one letter). Green once the company has responded. */
export function DropCard({ d, href }: { d: Drop; href: string }) {
  const where = [d.area, d.city].filter(Boolean).join(", ");
  return (
    <Link href={href} className={`block rounded-lg border p-4 hover:border-green-400 ${dropBg(d.responded)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{d.company_name}</p>
          <p className="truncate text-sm text-slate-600">{dropPlace(d)}</p>
          {where && <p className="truncate text-sm text-slate-500">{where}</p>}
        </div>
        {d.responded && (
          <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            {d.response_type === "email" ? "Email" : "Call"}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {fmtDate(d.drop_date)} · {d.responded
          ? <span className="font-medium text-green-700">Responded{d.response_date ? ` on ${fmtDate(d.response_date)}` : ""}</span>
          : "No response yet"}
      </p>
      {d.responded && (d.response_phone || d.response_email) && (
        <p className="mt-1 truncate text-xs text-green-800">{[d.response_phone, d.response_email].filter(Boolean).join(" · ")}</p>
      )}
    </Link>
  );
}

/**
 * Drops matching a filter, one page at a time, newest first. `more()` loads the next page.
 * Rows are null while the first page for the current filter loads.
 */
export function useDropPages(filter: DropFilter, pageSize: number) {
  const key = JSON.stringify(filter);
  const [state, setState] = useState<{ key: string; rows: Drop[]; cursor: Cursor | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const f = JSON.parse(key) as DropFilter;
    setLoading(true);
    setError(null);
    api.findDrops(f, { limit: pageSize }).then(
      (p) => { if (live) { setState({ key, rows: p.rows, cursor: p.cursor }); setLoading(false); } },
      (e) => { if (live) { setError(errMsg(e)); setLoading(false); } },
    );
    return () => { live = false; };
  }, [key, pageSize, tick]);
  const current = state?.key === key ? state : null;
  async function more() {
    if (!current?.cursor || loading) return;
    setLoading(true);
    try {
      const p = await api.findDrops(JSON.parse(key), { limit: pageSize, cursor: current.cursor });
      setState((s) => (s?.key === key ? { key, rows: [...s.rows, ...p.rows], cursor: p.cursor } : s));
    } catch (e) {
      setError(errMsg(e));
    }
    setLoading(false);
  }
  return { rows: current?.rows ?? null, hasMore: Boolean(current?.cursor), loading, error, more, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** "Show more" under a paged list: renders nothing once everything is shown. */
export function ShowMore({ hasMore, loading, onMore, left }: { hasMore: boolean; loading: boolean; onMore: () => void; left?: number | null }) {
  if (!hasMore) return null;
  return (
    <div className="mt-4 text-center">
      <button className={btn2Cls} onClick={onMore} disabled={loading}>
        {loading ? "Loading..." : `Show more${left ? ` (${left.toLocaleString("en-IN")} left)` : ""}`}
      </button>
    </div>
  );
}
