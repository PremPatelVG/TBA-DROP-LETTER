"use client";
import { useState } from "react";
import { api, type OpsScopeType } from "@/lib/data";
import { regionalTitle, scopeLabel } from "@/lib/labels";
import { btn2Cls, btnCls, cardCls, errMsg, Field, inputCls, Notice, useData } from "@/components/ui";
import { ResetPasswordDialog, type ResetTarget } from "@/components/reset-password-dialog";
import { isEmail, passwordError } from "@/lib/validate";

/**
 * Master only: create, deactivate and reactivate the regional (operations) accounts. One role, three tiers —
 * national ("TBA India Ops", all regions), a State president (one whole state) or a City president (one city).
 * Only the master manages these accounts; each one then adds advisors within its own scope.
 */
export default function RegionalAccounts() {
  const { data, error, reload } = useData(() => api.listOpsUsers());
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [scopeType, setScopeType] = useState<OpsScopeType>("state");
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);
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
      const p = await api.createOpsUser({ full_name: s("full_name"), email, scope_type: scopeType, scope_value, password: pw });
      form.reset();
      setScopeType("state");
      setMsg({ kind: "ok", text: `${p.full_name} added as ${regionalTitle(p.scope_type, p.scope_value)} (${scopeLabel(p.scope_type, p.scope_value)}). They can now sign in as ${p.email} with the password you set, or with Google.` });
      reload();
    } catch (err) {
      setMsg({ kind: "error", text: errMsg(err) });
    }
    setPending(false);
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
        <p className="mb-4 text-sm text-slate-600">Only master can add or deactivate these accounts. One role, three tiers: <span className="font-medium">TBA India Ops</span> (national — every region), a <span className="font-medium">State president</span> (one whole state) or a <span className="font-medium">City president</span> (one city). Each account adds advisors within its own scope; only master edits the belt thresholds.</p>
        {error && <Notice kind="error">{error}</Notice>}
        {!data ? <p className="text-slate-500">Loading...</p> : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>
                <th className="p-3 font-medium">Title</th><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Scope</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className={`border-t ${u.active ? "" : "bg-slate-50 text-slate-500"}`}>
                    <td className="p-3 font-medium">{regionalTitle(u.scope_type, u.scope_value)}</td>
                    <td className="p-3">{u.full_name}</td><td className="p-3">{u.email}</td>
                    <td className="p-3">{scopeLabel(u.scope_type, u.scope_value)}</td>
                    <td className="p-3">{u.active ? <span className="text-green-700">Active</span> : "Deactivated"}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button className={btn2Cls} onClick={() => setResetTarget({ id: u.id, full_name: u.full_name, email: u.email })}>Reset password</button>
                        <button className={btn2Cls} onClick={() => toggle(u.id, !u.active)}>{u.active ? "Deactivate" : "Reactivate"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No regional accounts yet.</td></tr>}
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
              <option value="national">TBA India Ops (national — all regions)</option>
              <option value="state">State president (one whole state)</option>
              <option value="city">City president (one city)</option>
            </select>
          </label>
          {needsRegion ? (
            <Field name="scope_value" label={scopeType === "state" ? "State name" : "City name"} placeholder={scopeType === "state" ? "Gujarat" : "Rajkot"} />
          ) : (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">TBA India Ops sees every state and city — all drops and advisors nationwide. It can add advisors anywhere, but it is not master and cannot edit the belt thresholds.</p>
          )}
          <Field name="password" label="Initial password" type="password" autoComplete="new-password" placeholder="At least 8 characters" />
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button disabled={pending} className={`${btnCls} w-full`}>{pending ? "Adding..." : "Add account"}</button>
        </form>
      </section>
      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)}
        onDone={(text) => { setResetTarget(null); setMsg({ kind: "ok", text }); }} />
    </div>
  );
}
