"use client";
import { useState } from "react";
import { api, type Level, type Profile } from "@/lib/data";
import { btn2Cls, btnCls, cardCls, errMsg, Field, inputCls, Notice, useData } from "@/components/ui";
import { isEmail } from "@/lib/validate";

export default function Advisors() {
  const { data, reload } = useData(async () => {
    const [advisors, levels] = await Promise.all([api.listAdvisors(), api.listLevels()]);
    return { advisors, levels };
  });
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const code = s("advisor_code").toUpperCase();
    const email = s("email").toLowerCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return setMsg({ kind: "error", text: "Advisor ID: 3-32 letters, digits, - or _." });
    if (!isEmail(email)) return setMsg({ kind: "error", text: "Enter the advisor's Google account email, for example name@gmail.com." });
    setPending(true);
    setMsg(null);
    try {
      await api.createAdvisor({ full_name: s("full_name"), advisor_code: code, region: s("region"), email });
      form.reset();
      setMsg({ kind: "ok", text: `Advisor ${code} added. They can now sign in with Google as ${email}.` });
      reload();
    } catch (err) {
      setMsg({ kind: "error", text: errMsg(err) });
    }
    setPending(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Advisors {data && `(${data.advisors.length})`}</h1>
        {!data ? <p className="text-slate-500">Loading...</p> : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>
                <th className="p-3 font-medium">ID</th><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Google email</th>
                <th className="p-3 font-medium">Region</th><th className="p-3 font-medium">Level</th><th className="p-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {data.advisors.map((a) => (
                  <tr key={a.id} className={`border-t align-top ${a.active ? "" : "bg-slate-50 text-slate-500"}`}>
                    <td className="p-3 font-mono">{a.advisor_code}</td><td className="whitespace-nowrap p-3">{a.full_name}</td>
                    <td className="whitespace-nowrap p-3">{a.email}</td><td className="p-3">{a.region}</td>
                    <td className="p-3"><LevelChanger advisor={a} levels={data.levels} onDone={reload} /></td>
                    <td className="whitespace-nowrap p-3">
                      {a.active ? "Active" : "Deactivated"}{" "}
                      <button className="text-xs text-green-700 underline"
                        onClick={() => api.setUserActive(a.id, !a.active).then(reload, (e) => setMsg({ kind: "error", text: errMsg(e) }))}>
                        {a.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-1 text-lg font-semibold">Add advisor</h2>
        <p className="mb-4 text-sm text-slate-600">Only people on this list can sign in. They use Google with the email below.</p>
        <form onSubmit={create} className={`${cardCls} space-y-4 p-4`}>
          <Field name="full_name" label="Full name" />
          <Field name="advisor_code" label="Advisor ID" placeholder="ADV004" className={`${inputCls} uppercase`} />
          <Field name="region" label="Region" />
          <Field name="email" label="Google email" type="email" autoComplete="off" placeholder="name@gmail.com" />
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button disabled={pending} className={`${btnCls} w-full`}>{pending ? "Adding..." : "Add advisor"}</button>
        </form>
      </section>
    </div>
  );
}

/** Manual level change for one advisor; writes a level_history row. */
function LevelChanger({ advisor, levels, onDone }: { advisor: Profile; levels: Level[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = levels.find((l) => l.id === advisor.level_id);
  if (!open) {
    return (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span>{current ? `${current.name} (${current.target_letters})` : "-"}</span>
        <button className="text-xs text-green-700 underline" onClick={() => setOpen(true)}>Change</button>
      </div>
    );
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api.changeAdvisorLevel(advisor.id, Number(f.get("level")), String(f.get("reason") ?? "").trim() || null);
      setOpen(false);
      onDone();
    } catch (x) {
      setErr(errMsg(x));
    }
  }
  return (
    <form onSubmit={save} className="min-w-52 space-y-2">
      <select name="level" defaultValue={advisor.level_id ?? levels[0]?.id} className={inputCls}>
        {levels.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.target_letters})</option>)}
      </select>
      <input name="reason" placeholder="Reason (optional)" className={inputCls} />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button className={btn2Cls}>Save</button>
        <button type="button" className={btn2Cls} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
