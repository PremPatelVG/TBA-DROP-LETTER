"use client";
import { useState } from "react";
import { api, type OpsScopeType } from "@/lib/data";
import { btn2Cls, btnCls, cardCls, errMsg, Field, inputCls, Notice, useData } from "@/components/ui";
import { isEmail } from "@/lib/validate";

const scopeLabel = (t: OpsScopeType | null, v: string | null) =>
  t && v ? `${t === "state" ? "State" : "City"}: ${v}` : "—";

/** Master only: create, deactivate and reactivate operations (admin) accounts, each scoped to a city or state. */
export default function OperationsAccounts() {
  const { data, error, reload } = useData(() => api.listOpsUsers());
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [scopeType, setScopeType] = useState<OpsScopeType>("city");

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const email = s("email").toLowerCase();
    const scope_value = s("scope_value");
    if (!isEmail(email)) return setMsg({ kind: "error", text: "Enter their Google account email, for example name@gmail.com." });
    if (!scope_value) return setMsg({ kind: "error", text: `Enter the ${scopeType} this account manages.` });
    setPending(true);
    setMsg(null);
    try {
      const p = await api.createOpsUser({ full_name: s("full_name"), email, scope_type: scopeType, scope_value });
      form.reset();
      setScopeType("city");
      setMsg({ kind: "ok", text: `${p.full_name} added to operations for ${scopeLabel(p.scope_type, p.scope_value)}. They can now sign in with Google as ${p.email}.` });
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
        <h1 className="mb-1 text-xl font-semibold">Operations accounts</h1>
        <p className="mb-4 text-sm text-slate-600">Only master can add or deactivate operations users. Each account manages one city or one whole state; the master sees every region.</p>
        {error && <Notice kind="error">{error}</Notice>}
        {!data ? <p className="text-slate-500">Loading...</p> : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>
                <th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Google email</th>
                <th className="p-3 font-medium">Region</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className={`border-t ${u.active ? "" : "bg-slate-50 text-slate-500"}`}>
                    <td className="p-3">{u.full_name}</td><td className="p-3">{u.email}</td>
                    <td className="p-3">{scopeLabel(u.scope_type, u.scope_value)}</td>
                    <td className="p-3">{u.active ? <span className="text-green-700">Active</span> : "Deactivated"}</td>
                    <td className="p-3 text-right">
                      <button className={btn2Cls} onClick={() => toggle(u.id, !u.active)}>{u.active ? "Deactivate" : "Reactivate"}</button>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No operations accounts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-4 text-lg font-semibold">Add operations account</h2>
        <form onSubmit={create} className={`${cardCls} space-y-4 p-4`}>
          <Field name="full_name" label="Full name" />
          <Field name="email" label="Google email" type="email" autoComplete="off" placeholder="name@gmail.com" />
          <label className="block text-sm font-medium">Manages<span className="text-red-500"> *</span>
            <select name="scope_type" value={scopeType} onChange={(e) => setScopeType(e.target.value as OpsScopeType)} className={inputCls}>
              <option value="city">One city</option>
              <option value="state">One whole state</option>
            </select>
          </label>
          <Field name="scope_value" label={scopeType === "state" ? "State name" : "City name"} placeholder={scopeType === "state" ? "Gujarat" : "Rajkot"} />
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button disabled={pending} className={`${btnCls} w-full`}>{pending ? "Adding..." : "Add account"}</button>
        </form>
      </section>
    </div>
  );
}
