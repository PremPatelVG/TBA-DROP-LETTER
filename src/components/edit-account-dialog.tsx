"use client";
import { useState } from "react";
import { api, type Profile } from "@/lib/data";
import { isIndianPhone } from "@/lib/validate";
import { btn2Cls, btnCls, errMsg, inputCls, Notice, useUser } from "@/components/ui";

/**
 * Edit account: change an advisor's or a regional account's name, phone and region. The login email (and the
 * advisor ID / regional tier) stays fixed. Shown only when `target` is set; the server (or demo data layer)
 * re-checks canEditAccount. A state/city account editing an advisor sees its own region fixed, as on Add advisor.
 */
export function EditAccountDialog({ target, onClose, onDone }: {
  target: Profile | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  if (!target) return null;
  return <EditForm key={target.id} target={target} onClose={onClose} onDone={onDone} />;
}

function EditForm({ target: t, onClose, onDone }: { target: Profile; onClose: () => void; onDone: (message: string) => void }) {
  const user = useUser();
  const isAdvisor = t.role === "advisor";
  const hasRegion = t.role === "operations" && (t.scope_type === "state" || t.scope_type === "city");
  const scopedCity = isAdvisor && user.role === "operations" && user.scope_type === "city" ? user.scope_value : null;
  const scopedState = isAdvisor && user.role === "operations" && user.scope_type === "state" ? user.scope_value : null;
  const [v, setV] = useState({
    full_name: t.full_name, phone: t.phone ?? "", city: t.city ?? "", state: t.state ?? "", zip: t.zip ?? "", scope_value: t.scope_value ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((cur) => ({ ...cur, [k]: e.target.value }));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v.full_name.trim()) return setError("Enter the name.");
    if (v.phone.trim() && !isIndianPhone(v.phone.trim())) return setError("Phone number: use 10 digits, optionally starting with +91, for example +91 98765 43210.");
    if (isAdvisor && !(scopedCity ?? v.city).trim()) return setError("Enter the city.");
    if (isAdvisor && !(scopedState ?? v.state).trim()) return setError("Enter the state.");
    if (hasRegion && !v.scope_value.trim()) return setError(`Enter the ${t.scope_type}.`);
    setError(null);
    setPending(true);
    try {
      const p = await api.updateAccount(t.id, {
        full_name: v.full_name, phone: v.phone.trim() || null,
        ...(isAdvisor ? { city: scopedCity ?? v.city, state: scopedState ?? v.state, zip: v.zip.trim() || null } : {}),
        ...(hasRegion ? { scope_value: v.scope_value } : {}),
      });
      onDone(`Saved ${p.full_name}'s details.`);
    } catch (e2) {
      setError(errMsg(e2));
      setPending(false);
    }
  }

  const fixed = (label: string, value: string) => (
    <label className="block text-sm font-medium">{label}
      <input value={value} disabled className={`${inputCls} bg-slate-100 text-slate-500`} />
    </label>
  );
  const field = (k: keyof typeof v, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm font-medium">{label}
      <input value={v[k]} onChange={set(k)} className={inputCls} {...extra} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${t.full_name}`}>
      <form noValidate onSubmit={submit} className="max-h-full w-full max-w-sm space-y-4 overflow-y-auto rounded-xl border bg-white p-5 shadow-lg">
        <div>
          <h2 className="text-lg font-semibold">Edit account</h2>
          <p className="mt-1 text-sm text-slate-600">The login email stays the same.</p>
        </div>
        {fixed("Login email", t.email)}
        {isAdvisor && t.advisor_code && fixed("Advisor ID", t.advisor_code)}
        {field("full_name", "Full name", { autoComplete: "off" })}
        {field("phone", "Phone (optional)", { type: "tel", inputMode: "tel", placeholder: "+91 98765 43210", autoComplete: "off" })}
        {isAdvisor && (
          <>
            {scopedCity ? fixed("City", scopedCity) : field("city", "City")}
            {scopedState ? fixed("State", scopedState) : field("state", "State")}
            {field("zip", "Zip code (optional)")}
          </>
        )}
        {hasRegion && field("scope_value", t.scope_type === "state" ? "State managed" : "City managed")}
        {(isAdvisor || hasRegion) && (
          <p className="text-xs text-slate-500">
            {isAdvisor ? "Changing the region files their new drops there; drops already logged stay where they were." : "Changing the region changes what this account sees."}
            {" "}If the region changes, they will be asked to sign in again.
          </p>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btn2Cls} disabled={pending}>Cancel</button>
          <button type="submit" className={btnCls} disabled={pending}>{pending ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
