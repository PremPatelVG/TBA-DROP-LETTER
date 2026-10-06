"use client";
import { useState } from "react";
import { api } from "@/lib/data";
import { btnCls, cardCls, errMsg, Field, fmtDate, inputCls, Notice, today, useData } from "@/components/ui";

const RECENT = 100;

export default function Leads() {
  const { data, reload } = useData(async () => {
    const [leads, recent] = await Promise.all([api.listLeads(), api.findDrops({}, { limit: RECENT })]);
    // Leads can point at older letters than the latest 100: fetch those few one by one.
    const known = new Map(recent.rows.map((d) => [d.id, d]));
    const missing = [...new Set(leads.map((l) => l.drop_id).filter((id): id is string => !!id && !known.has(id)))].slice(0, 30);
    const older = await Promise.all(missing.map((id) => api.getDrop(id).catch(() => null)));
    older.forEach((d) => d && known.set(d.id, d));
    return { leads, drops: recent.rows, byId: known };
  });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const s = (k: string) => String(f.get(k) ?? "").trim() || null;
    if (!s("phone") && !s("email")) return setError("Add a phone number or an email.");
    setPending(true); setError(null); setOk(false);
    try {
      await api.createLead({
        contact_name: s("contact_name")!, company_name: s("company_name"), phone: s("phone"), email: s("email"),
        notes: s("notes"), lead_date: s("lead_date") ?? today(), drop_id: s("drop_id"),
      });
      form.reset();
      setOk(true);
      reload();
    } catch (err) {
      setError(errMsg(err));
    }
    setPending(false);
  }

  return (
    <div className="grid gap-6">
      <section className="order-2">
        <h1 className="mb-4 text-xl font-semibold">Direct leads</h1>
        {!data ? <p className="text-slate-500">Loading...</p> : data.leads.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-white p-8 text-center text-slate-500">No leads yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.leads.map((l) => {
              const drop = l.drop_id ? data.byId.get(l.drop_id) : undefined;
              return (
                <li key={l.id} className={`${cardCls} p-4`}>
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{l.contact_name}{l.company_name && <span className="font-normal text-slate-600"> · {l.company_name}</span>}</p>
                    <span className="shrink-0 text-xs text-slate-500">{fmtDate(l.lead_date)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {l.phone && <a className="text-green-700" href={`tel:${l.phone}`}>{l.phone}</a>}
                    {l.phone && l.email && " · "}
                    {l.email && <a className="text-green-700" href={`mailto:${l.email}`}>{l.email}</a>}
                  </p>
                  {l.notes && <p className="mt-1 text-sm">{l.notes}</p>}
                  {drop && <p className="mt-1 text-xs text-slate-500">From the letter to office {drop.office_number}, {drop.building_name} ({fmtDate(drop.drop_date)})</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="order-1">
        <h2 className="mb-4 text-lg font-semibold">Add lead</h2>
        <form onSubmit={submit} className={`${cardCls} space-y-4 p-4`}>
          <Field name="contact_name" label="Contact name" />
          <Field name="company_name" label="Company" required={false} />
          <Field name="phone" label="Phone" type="tel" inputMode="tel" required={false} />
          <Field name="email" label="Email" type="email" required={false} />
          <Field name="lead_date" label="Date" type="date" defaultValue={today()} max={today()} />
          <label className="block text-sm font-medium">Related letter (optional, latest 100)
            <select name="drop_id" defaultValue="" className={inputCls}>
              <option value="">None</option>
              {data?.drops.map((d) => (
                <option key={d.id} value={d.id}>{d.drop_date} · {d.office_number} {d.company_name}, {d.building_name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">Notes<textarea name="notes" rows={2} className={inputCls} /></label>
          {error && <Notice kind="error">{error}</Notice>}
          {ok && <Notice kind="ok">Lead saved.</Notice>}
          <button disabled={pending} className={`${btnCls} w-full`}>{pending ? "Saving..." : "Save lead"}</button>
        </form>
      </section>
    </div>
  );
}
