"use client";
import { btn2Cls } from "@/components/ui";
import type { WelcomeEmailPreview } from "@/lib/data/types";

/**
 * Shows a preview of the welcome email a new advisor receives — their login, password and the app download link.
 * Rendered (and shown) only when `email` is set. This is the DEMO preview: no email is actually sent. The body is
 * shown in a sandboxed iframe so it looks exactly as the advisor would see it, with no styles leaking either way.
 */
export function WelcomeEmailPreviewDialog({ email, onClose }: { email: WelcomeEmailPreview | null; onClose: () => void }) {
  if (!email) return null;
  const e = email;
  const row = (label: string, value: string) => (
    <div className="flex gap-2 text-sm">
      <span className="w-16 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words font-medium">{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Welcome email preview">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-white shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Welcome email</h2>
            <p className="mt-0.5 text-xs text-slate-500">Demo preview — no email is actually sent. This is what the advisor receives.</p>
          </div>
          <button type="button" onClick={onClose} className={btn2Cls}>Close</button>
        </div>
        <div className="space-y-1 border-b bg-slate-50 p-4">
          {row("From", e.from)}
          {row("To", e.to)}
          {row("Subject", e.subject)}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <iframe title="Welcome email body" srcDoc={e.html} sandbox="" className="h-96 w-full rounded-md border bg-white" />
        </div>
      </div>
    </div>
  );
}
