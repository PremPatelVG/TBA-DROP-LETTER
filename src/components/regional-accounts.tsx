"use client";
import { useState } from "react";
import { api, type OpsScopeType, type Profile, type WelcomeEmailPreview, type WelcomeEmailResult } from "@/lib/data";
import { regionalTitle, scopeLabel } from "@/lib/labels";
import { btn2Cls, btnCls, cardCls, errMsg, Field, inputCls, Notice, useData, useUser } from "@/components/ui";
import { canEditAccount, canManageRegionalAccount, canResendWelcome, manageableRegionalTiers } from "@/lib/data/authz";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { WelcomeEmailPreviewDialog } from "@/components/welcome-email-preview";
import { ResetPasswordDialog, type ResetTarget } from "@/components/reset-password-dialog";
import { isEmail, passwordError } from "@/lib/validate";

const TIER_OPTION: Record<OpsScopeType, string> = {
  national: "TBA India Ops (national — all regions)",
  state: "State president (one whole state)",
  city: "City president (one city)",
};

/**
 * Create, deactivate/reactivate and reset the password of regional (operations) accounts. One role, three tiers —
 * national ("TBA India Ops", all regions), a State president (one whole state) or a City president (one city).
 * Master manages every tier; the national account manages state and city accounts only. Which tiers and rows are
 * offered comes from canManageRegionalAccount (src/lib/data/authz.ts); the server enforces the same.
 */
export default function RegionalAccounts() {
  const user = useUser();
  const tiers = manageableRegionalTiers(user);
  const isMaster = user.role === "master";
  const { data, error, reload } = useData(() => api.listOpsUsers());
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  // The last welcome email prepared in the demo, so it can be (re)opened as a preview (same modal as advisors).
  const [emailPreview, setEmailPreview] = useState<WelcomeEmailPreview | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [pending, setPending] = useState(false);
  const [scopeType, setScopeType] = useState<OpsScopeType>("state");
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const needsRegion = scopeType !== "national";

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const email = s("email").toLowerCase();
    const scope_value = s("scope_value");
    const pw = String(f.get("password") ?? "");
    if (!isEmail(email)) return setMsg({ kind: "error", text: "Enter their account email, for example name@gmail.com." });
    if (needsRegion && !scope_value) return setMsg({ kind: "error", text: `Enter the ${scopeType} this account manages.` });
    const pwErr = passwordError(pw);
    if (pwErr) return setMsg({ kind: "error", text: pwErr });
    setPending(true);
    setMsg(null);
    try {
      const { profile: p, welcomeEmail } = await api.createOpsUser({ full_name: s("full_name"), email, scope_type: scopeType, scope_value, password: pw });
      form.reset();
      setScopeType("state");
      const base = `${p.full_name} added as ${regionalTitle(p.scope_type, p.scope_value)} (${scopeLabel(p.scope_type, p.scope_value)}). They can now sign in as ${p.email} with the password you set, or with Google.`;
      showWelcome(welcomeEmail, base, p.email);
      reload();
    } catch (err) {
      setMsg({ kind: "error", text: errMsg(err) });
    }
    setPending(false);
  }
  /** Reports the welcome-email outcome (best effort: the account exists whatever happened to the email). */
  function showWelcome(r: WelcomeEmailResult, base: string, email: string) {
    if (r.status === "preview") {
      // Demo: nothing is actually sent — show exactly what the account would receive.
      setEmailPreview(r.preview);
      setShowEmail(true);
      setMsg({ kind: "ok", text: `${base} A welcome email with their login, the portal link and the app download link was prepared — open the preview to see it.` });
    } else if (r.status === "sent") {
      setMsg({ kind: "ok", text: `${base} A welcome email with their login, the portal link and the app download link was sent to ${email}.` });
    } else {
      setMsg({ kind: "info", text: `${base} The welcome email could not be sent (${r.reason}) — share their login and the links with them directly.` });
    }
  }
  // Resend: the original password is never stored, so this sets a fresh temporary password and emails it.
  async function resend(id: string, name: string, email: string) {
    if (!window.confirm(`Resend the welcome email to ${name}? This sets a new temporary password and emails it to ${email}; their current password stops working.`)) return;
    setMsg(null);
    try {
      const r = await api.resendWelcomeEmail(id);
      if (r.status === "failed" || r.status === "skipped") {
        setMsg({ kind: "error", text: `The welcome email could not be sent (${r.reason}). Use Reset password and share the new password with them directly.` });
      } else {
        showWelcome(r, `A new temporary password was set for ${name}.`, email);
      }
    } catch (err) {
      setMsg({ kind: "error", text: errMsg(err) });
    }
  }
  async function toggle(id: string, active: boolean) {
    try {
      await api.setUserActive(id, active);
      reload();
    } catch (err) {
      setMsg({ kind: "error", text: errMsg(err) });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-1 text-xl font-semibold">Regional accounts</h1>
        <p className="mb-4 text-sm text-slate-600">{isMaster ? "Master adds and manages every tier; TBA India Ops adds and manages state and city accounts." : "As TBA India Ops you can add, edit, deactivate and reset state and city accounts. National accounts are managed by master."} One role, three tiers: <span className="font-medium">TBA India Ops</span> (national — every region), a <span className="font-medium">State president</span> (one whole state) or a <span className="font-medium">City president</span> (one city). Each account adds advisors within its own scope; only master edits the belt thresholds.</p>
        {error && <Notice kind="error">{error}</Notice>}
        {!data ? <p className="text-slate-500">Loading...</p> : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>
                <th className="p-3 font-medium">Title</th><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Phone</th><th className="p-3 font-medium">Scope</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className={`border-t ${u.active ? "" : "bg-slate-50 text-slate-500"}`}>
                    <td className="p-3 font-medium">{regionalTitle(u.scope_type, u.scope_value)}</td>
                    <td className="p-3">{u.full_name}</td><td className="p-3">{u.email}</td>
                    <td className="whitespace-nowrap p-3 tabular-nums">{u.phone ?? "-"}</td>
                    <td className="p-3">{scopeLabel(u.scope_type, u.scope_value)}</td>
                    <td className="p-3">{u.active ? <span className="text-green-700">Active</span> : "Deactivated"}</td>
                    <td className="p-3 text-right">
                      {canManageRegionalAccount(user, u.scope_type) && u.id !== user.id && <div className="flex justify-end gap-2">
                        {canEditAccount(user, u) && <button className={btn2Cls} onClick={() => setEditTarget(u)}>Edit</button>}
                        {u.active && canResendWelcome(user, u) && <button className={btn2Cls} onClick={() => resend(u.id, u.full_name, u.email)}>Resend welcome email</button>}
                        <button className={btn2Cls} onClick={() => setResetTarget({ id: u.id, full_name: u.full_name, email: u.email })}>Reset password</button>
                        <button className={btn2Cls} onClick={() => toggle(u.id, !u.active)}>{u.active ? "Deactivate" : "Reactivate"}</button>
                      </div>}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No regional accounts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Add regional account</h2>
        <form onSubmit={create} className={`${cardCls} space-y-4 p-4`}>
          <Field name="full_name" label="Full name" />
          <Field name="email" label="Email" type="email" autoComplete="off" placeholder="name@gmail.com" />
          <label className="block text-sm font-medium">Tier<span className="text-red-500"> *</span>
            <select name="scope_type" value={scopeType} onChange={(e) => setScopeType(e.target.value as OpsScopeType)} className={inputCls}>
              {tiers.map((t) => <option key={t} value={t}>{TIER_OPTION[t]}</option>)}
            </select>
          </label>
          {needsRegion ? (
            <Field name="scope_value" label={scopeType === "state" ? "State name" : "City name"} placeholder={scopeType === "state" ? "Gujarat" : "Rajkot"} />
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">TBA India Ops sees every state and city — all drops and advisors nationwide. It can add advisors anywhere, but it is not master and cannot edit the belt thresholds.</p>
          )}
          <Field name="password" label="Initial password" type="password" autoComplete="new-password" placeholder="At least 8 characters" />
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          {emailPreview && !showEmail && <button type="button" className={`${btn2Cls} w-full`} onClick={() => setShowEmail(true)}>View welcome email</button>}
          <button disabled={pending} className={`${btnCls} w-full`}>{pending ? "Adding..." : "Add account"}</button>
        </form>
      </section>
      <WelcomeEmailPreviewDialog email={showEmail ? emailPreview : null} onClose={() => setShowEmail(false)} />
      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)}
        onDone={(text) => { setResetTarget(null); setMsg({ kind: "ok", text }); }} />
      <EditAccountDialog target={editTarget} onClose={() => setEditTarget(null)}
        onDone={(text) => { setEditTarget(null); setMsg({ kind: "ok", text }); reload(); }} />
    </div>
  );
}
