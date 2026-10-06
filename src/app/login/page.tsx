"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, USE_MOCK, type AccessResult, type DemoAccount } from "@/lib/data";
import { resetMockData } from "@/lib/data/mock";
import { accessRedirect, errMsg, homeFor, Notice, useData } from "@/components/ui";
import { GoogleMark } from "@/components/google-mark";

type Phase = "checking" | "idle" | "pending" | "redirecting";
const LABEL: Record<Phase, string> = { checking: "Checking sign-in...", idle: "Sign in with Google", pending: "Signing in...", redirecting: "Opening Google..." };

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
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

  async function signIn(opts?: { demoEmail?: string; redirect?: boolean }) {
    setError(null);
    setPhase("pending");
    try {
      handle(await api.signInWithGoogle(opts));
    } catch (e) {
      setError(errMsg(e));
      setPhase("idle");
    }
  }
  const busy = phase !== "idle";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">TBA Drop Letter</p>
          <h1 className="mt-1 text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Use the Google account your operations team added for you.</p>
          {choosing ? (
            <AccountChooser accounts={demo ?? []} disabled={busy} onPick={(email) => signIn({ demoEmail: email })} onCancel={() => setChoosing(false)} />
          ) : (
            <button onClick={() => (USE_MOCK ? setChoosing(true) : signIn())} disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60">
              <GoogleMark />{LABEL[phase]}
            </button>
          )}
          {!USE_MOCK && (
            <button onClick={() => signIn({ redirect: true })} disabled={busy} className="mt-3 text-xs text-green-700 underline disabled:opacity-60">
              Pop-up blocked or stuck? Sign in on this page instead
            </button>
          )}
          {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
          <p className="mt-4 text-xs text-slate-500">Only people added by the operations team can use the app. There is no public signup.</p>
        </div>

        {USE_MOCK && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Demo mode</p>
            <p className="mt-1 text-xs text-amber-800">
              &ldquo;Sign in with Google&rdquo; offers sample accounts instead of real Google accounts, including one that is not
              on the access list. Data lives in this browser only.
            </p>
            <button onClick={() => { resetMockData(); location.reload(); }} className="mt-3 text-xs text-amber-900 underline">Reset demo data</button>
          </div>
        )}
      </div>
    </main>
  );
}

/** Demo data only: stands in for Google's account chooser. */
function AccountChooser({ accounts, disabled, onPick, onCancel }: { accounts: DemoAccount[]; disabled: boolean; onPick: (email: string) => void; onCancel: () => void }) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border" role="group" aria-label="Choose an account">
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
