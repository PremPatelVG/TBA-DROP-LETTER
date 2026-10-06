"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { btnCls } from "@/components/ui";

export default function NotAuthorisedPage() {
  return <Suspense><NotAuthorised /></Suspense>;
}

/** Shown after a sign-in by someone who is not on the access list or has been deactivated. They are already signed out. */
function NotAuthorised() {
  const params = useSearchParams();
  const deactivated = params.get("reason") === "deactivated";
  const email = params.get("email");
  const who = email ? <span className="font-medium text-slate-900 break-all">{email}</span> : "This Google account";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm" role="alert">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Not authorised</p>
        <h1 className="mt-1 text-xl font-semibold">{deactivated ? "Your access has been turned off" : "You don't have access to TBA Drop Letter"}</h1>
        <p className="mt-3 text-sm text-slate-600">
          {deactivated
            ? <>{who} has been deactivated. If you think this is a mistake, contact your operations team.</>
            : <>{who} is not on the access list. Ask your operations team to add it, then sign in again.</>}
        </p>
        <p className="mt-3 text-sm text-slate-600">You have been signed out.</p>
        <Link href="/login" className={`${btnCls} mt-5 w-full`}>Sign in with a different account</Link>
      </div>
    </main>
  );
}
