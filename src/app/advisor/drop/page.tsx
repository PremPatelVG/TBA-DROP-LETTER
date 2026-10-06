"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { api, type Drop } from "@/lib/data";
import { btnCls, dropPlace, errMsg, fmtDate, inputCls, Notice, today, useData } from "@/components/ui";
import { responseContactError } from "@/lib/validate";

export default function DropResponsePage() {
  return <Suspense><DropResponse /></Suspense>;
}

// /advisor/drop?id=<drop id>: one page for every drop, so the offline copy of the app can open any of them.
function DropResponse() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  // Opened from Log response: go back there (search kept) after saving.
  const back = params.get("from") === "responses" ? "/advisor/responses" : "/advisor";
  const { data, error } = useData(async () => ({ drop: id ? await api.getDrop(id) : null }), [id]);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <p className="text-slate-500">Loading...</p>;
  return <ResponseForm key={data.drop?.id ?? "none"} drop={data.drop} back={back} />;
}

function ResponseForm({ drop, back }: { drop: Drop | null; back: string }) {
  const router = useRouter();
  const [responded, setResponded] = useState(drop?.responded ?? false);
  // Kept in state so switching to "No" and back does not lose what was typed.
  const [phone, setPhone] = useState(drop?.response_phone ?? "");
  const [email, setEmail] = useState(drop?.response_email ?? "");
  const [error, setError] = useState<{ field?: "phone" | "email" | "date"; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  if (!drop) return <Notice kind="error">Drop not found.</Notice>;
  const d = drop;
  const where = [d.area, d.city].filter(Boolean).join(", ");

  function fail(err: { field?: "phone" | "email" | "date"; message: string }) {
    setError(err);
    ({ phone: phoneRef, email: emailRef, date: dateRef })[err.field ?? "phone"].current?.focus();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    if (responded) {
      const date = s("response_date");
      if (!date) return fail({ field: "date", message: "Enter the response date." });
      if (date < d.drop_date || date > today()) return fail({ field: "date", message: `The response date must be between ${fmtDate(d.drop_date)} and today.` });
      const contact = responseContactError(true, phone, email);
      if (contact) return fail(contact);
    }
    setPending(true);
    setError(null);
    try {
      await api.updateDropResponse(d.id, {
        responded,
        response_type: responded ? (s("response_type") as "call" | "email") : "none",
        response_date: responded ? s("response_date") : null,
        response_notes: s("response_notes") || null,
        response_phone: responded ? phone.trim() || null : null,
        response_email: responded ? email.trim() || null : null,
      });
      if (!navigator.onLine) {
        setSavedOffline(true);
        setPending(false);
        return;
      }
      router.push(`${back}?saved=1`);
    } catch (err) {
      setError({ message: errMsg(err) });
      setPending(false);
    }
  }

  const invalid = (field: "phone" | "email" | "date") => (error?.field === field ? { "aria-invalid": true, "aria-describedby": "response-error" } : {});
  const inputErr = `${inputCls} aria-[invalid=true]:border-red-500`;

  return (
    <>
      <Link href={back} className="mb-3 inline-block text-sm text-green-700">&larr; Back</Link>
      <h1 className="text-xl font-semibold">{d.company_name}</h1>
      <p className="mb-4 text-sm text-slate-600">
        {dropPlace(d)}{where && <><br />{where}</>}{d.full_address && <><br />{d.full_address}</>}
        <br />Dropped on {fmtDate(d.drop_date)}
      </p>
      <form noValidate onSubmit={submit} className={`space-y-4 rounded-lg border p-4 ${responded ? "border-green-200 bg-green-50" : "bg-white"}`}>
        <fieldset>
          <legend className="text-sm font-medium">Responded?</legend>
          <div className="mt-2 flex gap-3">
            {([true, false] as const).map((v) => (
              <label key={String(v)} className="flex flex-1 items-center justify-center gap-2 rounded-md border bg-white px-3 py-2.5">
                <input type="radio" name="responded" checked={responded === v} onChange={() => { setResponded(v); setError(null); }} />
                {v ? "Yes" : "No"}
              </label>
            ))}
          </div>
        </fieldset>
        {responded && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Response type
              <select name="response_type" defaultValue={d.response_type === "none" ? "call" : d.response_type} className={inputCls}>
                <option value="call">Call</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label className="block text-sm font-medium" htmlFor="response_date">Response date
              <input ref={dateRef} id="response_date" type="date" name="response_date" min={d.drop_date} max={today()}
                defaultValue={d.response_date ?? today()} className={inputErr} {...invalid("date")} />
            </label>
            <p className="text-sm font-medium sm:col-span-2">
              Person who responded <span className="font-normal text-slate-600">(phone or email, at least one)</span>
            </p>
            <label className="block text-sm font-medium" htmlFor="response_phone">Phone number
              <input ref={phoneRef} id="response_phone" type="tel" inputMode="tel" autoComplete="off" placeholder="+91 98765 43210"
                value={phone} onChange={(e) => setPhone(e.target.value)} className={inputErr} {...invalid("phone")} />
            </label>
            <label className="block text-sm font-medium" htmlFor="response_email">Email
              <input ref={emailRef} id="response_email" type="email" inputMode="email" autoComplete="off" placeholder="name@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)} className={inputErr} {...invalid("email")} />
            </label>
          </div>
        )}
        <label className="block text-sm font-medium">Notes
          <textarea name="response_notes" rows={3} defaultValue={d.response_notes ?? ""} className={inputCls} />
        </label>
        {error && <p id="response-error" role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
        {savedOffline && <Notice kind="ok">Response saved on this phone. It will sync when you are back online.</Notice>}
        <button disabled={pending} className={`${btnCls} w-full`}>{pending ? "Saving..." : "Save response"}</button>
      </form>
    </>
  );
}
