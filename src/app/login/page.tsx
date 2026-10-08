"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, USE_MOCK, type AccessResult, type DemoAccount } from "@/lib/data";
import { resetMockData } from "@/lib/data/mock";
import { accessRedirect, btnCls, errMsg, homeFor, inputCls, Notice, useData } from "@/components/ui";
import { GoogleMark } from "@/components/google-mark";

type Phase = "checking" | "idle" | "pending" | "redirecting";
const GOOGLE_LABEL: Record<Phase, string> = { checking: "Checking sign-in...", idle: "Sign in with Google", pending: "Please wait...", redirecting: "Opening Google..." };

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { data: demo } = useData(() => api.demoAccounts());

  const handle = useCallback((a: AccessResult | null) => {
    if (a?.status === "ok") return router.replace(homeFor(a.profile.role));
    if (a?.status === "not_authorised") return router.replace(accessRedirect(a)!);
    if (a?.status === "redirecting") return setPhase("redirecting");
    if (a?.status === "cancelled") setError("Sign-in was cancelled. Try again when you are ready.");
    setPhase("idle");
  }, [router]);

  // Already signed in, or coming back from Google after a redirect sign-in.
  useEffect(() => {
    api.currentAccess().then(handle, (e) => { setError(errMsg(e)); setPhase("idle"); });
  }, [handle]);

  async function signInGoogle(opts?: { demoEmail?: string; redirect?: boolean }) {
    setError(null); setInfo(null);
    setPhase("pending");
    try {
      handle(await api.signInWithGoogle(opts));
    } catch (e) {
      setError(errMsg(e));
      setPhase("idle");
    }
  }

  async function signInPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setInfo(null);
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setPhase("pending");
    try {
      handle(await api.signInWithPassword(email, password));
    } catch (err) {
      setError(errMsg(err));
      setPhase("idle");
    }
  }

  async function forgot() {
    setError(null); setInfo(null);
    if (!email.trim()) { setError("Enter your email above first, then choose “Forgot password?”."); return; }
    try {
      await api.sendPasswordReset(email);
      setInfo("If an account exists for that email, a password-reset link is on its way. Check your inbox.");
    } catch (err) {
      setError(errMsg(err));
    }
  }

  const busy = phase !== "idle";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">TBA Drop Letter</p>
          <h1 className="mt-1 text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Use the email your operations team added for you, with your password or Google.</p>

          <form onSubmit={signInPassword} className="mt-5 space-y-3">
            <label className="block text-sm font-medium">Email
              <input id="login-email" name="email" type="email" autoComplete="username" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} className={inputCls} placeholder="name@example.com" />
            </label>
            <label className="block text-sm font-medium">Password
              <input id="login-password" name="password" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} className={inputCls} />
            </label>
            <button type="submit" disabled={busy} className={`${btnCls} w-full`}>{phase === "pending" ? "Signing in..." : "Sign in"}</button>
          </form>
          <button type="button" onClick={forgot} disabled={busy} className="mt-2 text-xs text-green-700 underline disabled:opacity-60">Forgot password?</button>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-400" aria-hidden>
            <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
          </div>

          {choosing ? (
            <AccountChooser accounts={demo ?? []} disabled={busy} onPick={(e) => signInGoogle({ demoEmail: e })} onCancel={() => setChoosing(false)} />
          ) : (
            <button onClick={() => (USE_MOCK ? setChoosing(true) : signInGoogle())} disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60">
              <GoogleMark />{GOOGLE_LABEL[phase]}
            </button>
          )}
          {!USE_MOCK && !choosing && (
            <button onClick={() => signInGoogle({ redirect: true })} disabled={busy} className="mt-3 text-xs text-green-700 underline disabled:opacity-60">
              Pop-up blocked or stuck? Sign in on this page instead
            </button>
          )}
          {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
          {info && <div className="mt-4"><Notice kind="ok">{info}</Notice></div>}
          <p className="mt-4 text-xs text-slate-500">Only people added by the operations team can use the app. There is no public signup.</p>
        </div>

        {USE_MOCK && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Demo mode</p>
            <p className="mt-1 text-xs text-amber-800">
              Try email + password with a demo account below (tap <span className="font-medium">Use</span> to fill the form), or
              &ldquo;Sign in with Google&rdquo; to pick one from a list, including an account that is not on the access list.
              Data lives in this browser only.
            </p>
            <DemoCredentials accounts={demo ?? []} onUse={(a) => { setEmail(a.email); setPassword(a.password); setError(null); setInfo(null); }} />
            <button onClick={() => { resetMockData(); location.reload(); }} className="mt-3 text-xs text-amber-900 underline">Reset demo data</button>
          </div>
        )}
      </div>
    </main>
  );
}

/** Demo data only: shows the demo accounts and their shared password, and fills the sign-in form on tap. */
function DemoCredentials({ accounts, onUse }: { accounts: DemoAccount[]; onUse: (a: DemoAccount) => void }) {
  if (!accounts.length) return null;
  const shared = accounts.find((a) => a.password)?.password;
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-amber-200 bg-white">
      {shared && (
        <p className="border-b border-amber-100 px-3 py-2 text-xs text-amber-800">
          Password for every demo account: <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-amber-900">{shared}</code>
        </p>
      )}
      <ul className="max-h-44 divide-y divide-amber-50 overflow-y-auto text-xs">
        {accounts.map((a) => (
          <li key={a.email} className="flex items-center gap-2 px-3 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-700">{a.email}</span>
              <span className="block truncate text-[11px] text-slate-500">{a.note}</span>
            </span>
            <button type="button" onClick={() => onUse(a)}
              className="shrink-0 rounded border border-amber-300 px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-50">Use</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Demo data only: stands in for Google's account chooser. */
function AccountChooser({ accounts, disabled, onPick, onCancel }: { accounts: DemoAccount[]; disabled: boolean; onPick: (email: string) => void; onCancel: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border" role="group" aria-label="Choose an account">
      <div className="border-b bg-slate-50 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium"><GoogleMark className="h-4 w-4" />Choose an account</p>
        <p className="mt-0.5 text-xs text-slate-500">to continue to TBA Drop Letter (demo accounts)</p>
      </div>
      <ul className="divide-y">
        {accounts.map((a) => (
          <li key={a.email}>
            <button disabled={disabled} onClick={() => onPick(a.email)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 disabled:opacity-60">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700" aria-hidden>{a.name[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="block truncate text-xs text-slate-500">{a.email}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] leading-tight text-slate-500">{a.note}</span>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={onCancel} className="w-full border-t px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
    </div>
  );
}
