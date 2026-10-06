"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/data";
import { btnCls, errMsg, Field, inputCls, Notice, today } from "@/components/ui";

const REQUIRED = ["office_number", "company_name", "building_name", "block_no"] as const;

export default function NewDrop() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // "Save and add another" keeps the building details and date, since one entry is one letter
  // and an advisor usually leaves many letters in the same building.
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const another = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "another";
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    if (REQUIRED.some((k) => !s(k))) return setError("Fill in office number, company name, building name and block number.");
    setPending(true);
    setError(null);
    try {
      await api.createDrop({
        office_number: s("office_number"), company_name: s("company_name"), building_name: s("building_name"), block_no: s("block_no"),
        area: s("area") || null, city: s("city") || null, full_address: s("full_address") || null, drop_date: s("drop_date") || today(),
      });
      // Without signal the entry waits on this phone; stay on the form (other screens need a connection to open).
      const offline = !navigator.onLine;
      if (!another && !offline) return router.push("/advisor?saved=1");
      setSaved(`Saved office ${s("office_number")}, ${s("company_name")}${offline ? " on this phone. It will sync when you are back online." : "."}`);
      for (const k of ["office_number", "company_name"]) (form.current?.elements.namedItem(k) as HTMLInputElement).value = "";
      (form.current?.elements.namedItem("office_number") as HTMLInputElement).focus();
    } catch (err) {
      setError(errMsg(err));
    }
    setPending(false);
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">New drop</h1>
      <p className="mb-4 text-sm text-slate-600">One entry for each letter you leave.</p>
      <form ref={form} onSubmit={submit} className="grid gap-4 rounded-lg border bg-white p-4 sm:grid-cols-2">
        <Field id="office_number" name="office_number" label="Office number" placeholder="301-302" autoComplete="off" />
        <Field id="company_name" name="company_name" label="Company name" placeholder="Vasant Group" autoComplete="off" />
        <Field id="building_name" name="building_name" label="Building name" placeholder="Shivalik Shilp" />
        <Field id="block_no" name="block_no" label="Block no." placeholder="1 or A" autoCapitalize="characters" />
        <Field id="area" name="area" label="Area" required={false} placeholder="Satellite" />
        <Field id="city" name="city" label="City" required={false} placeholder="Ahmedabad" />
        <label className="block text-sm font-medium sm:col-span-2" htmlFor="full_address">Full address
          <textarea id="full_address" name="full_address" rows={2} className={inputCls} />
        </label>
        <Field id="drop_date" name="drop_date" label="Date of drop" type="date" defaultValue={today()} max={today()} />
        {error && <div className="sm:col-span-2"><Notice kind="error">{error}</Notice></div>}
        {saved && <div className="sm:col-span-2"><Notice kind="ok">{saved} Building details kept for the next letter.</Notice></div>}
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <button name="action" value="save" disabled={pending} className={btnCls}>{pending ? "Saving..." : "Save drop"}</button>
          <button name="action" value="another" disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50">
            Save and add another
          </button>
        </div>
      </form>
    </>
  );
}
