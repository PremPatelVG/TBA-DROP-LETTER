"use client";
import { useState } from "react";
import { api } from "@/lib/data";
import { passwordError } from "@/lib/validate";
import { btn2Cls, btnCls, errMsg, inputCls, Notice } from "@/components/ui";

export type ResetTarget = { id: string; full_name: string; email: string };

/**
 * A small modal for an admin to set a new password for a user they manage. Rendered (and shown) only when
 * `target` is set. The server action re-checks that the caller may reset this user; this is the convenient path
 * alongside the user's own "Forgot password?" email on the sign-in screen.
 */
export function ResetPasswordDialog({ target, onClose, onDone }: {
  target: ResetTarget | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!target) return null;
  const t = target;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = passwordError(password);
    if (err) return setError(err);
    setError(null);
    setPending(true);
    try {
      await api.resetUserPassword(t.id, password);
      setPassword("");
      onDone(`New password set for ${t.full_name}. Share it with them; they can change it later with “Forgot password?” on the sign-in screen.`);
    } catch (e2) {
      setError(errMsg(e2));
    }
    setPending(false);
  }

  function cancel() {
    setPassword("");
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Reset password for ${t.full_name}`}>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-white p-5 shadow-lg">
        <div>
          <h2 className="text-lg font-semibold">Reset password</h2>
          <p className="mt-1 text-sm text-slate-600">
            Set a new password for <span className="font-medium">{t.full_name}</span> ({t.email}).
          </p>
        </div>
        <label className="block text-sm font-medium">New password
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" />
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} className={btn2Cls} disabled={pending}>Cancel</button>
          <button type="submit" className={btnCls} disabled={pending}>{pending ? "Saving..." : "Set password"}</button>
        </div>
      </form>
    </div>
  );
}
