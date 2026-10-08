"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { DropFilter } from "@/lib/data";
import { btn2Cls, DropCard, inputCls, Notice, ShowMore, useDropPages } from "@/components/ui";

const PAGE = 50;
// Kept while the app is open, so coming back from a drop shows the same search.
let remembered = { q: "", date: "", responded: "", method: "" };

function Saved() {
  return useSearchParams().get("saved") ? <div className="mb-4"><Notice kind="ok">Response saved.</Notice></div> : null;
}

/** Find one of my letters by office number, company or building, then log the response on it. */
export default function LogResponse() {
  const [q, setQ] = useState(remembered.q);
  const [date, setDate] = useState(remembered.date);
  const [responded, setResponded] = useState(remembered.responded);
  const [method, setMethod] = useState(remembered.method);
  const [term, setTerm] = useState(remembered.q);
  useEffect(() => {
    remembered = { q, date, responded, method };
    const t = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(t);
  }, [q, date, responded, method]);

  const searching = Boolean(term.trim() || date || responded || method);
  const found = useDropPages({
    q: term.trim() || undefined, from: date || undefined, to: date || undefined,
    responded: responded ? responded === "yes" : undefined,
    method: (method || undefined) as DropFilter["method"],
  }, searching ? PAGE : 20);
  const rows = found.rows;

  return (
    <>
      <Suspense><Saved /></Suspense>
      <h1 className="mb-1 text-xl font-semibold">Log response</h1>
      <p className="mb-4 text-sm text-slate-600">Find the letter the company replied to, then record the call or email.</p>
      <div className="mb-4 space-y-3 rounded-lg border bg-white p-4">
        <label className="block text-sm font-medium" htmlFor="response-search">Search
          <input id="response-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
            placeholder="Office no., company or building" className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium" htmlFor="response-status">Response
            <select id="response-status" value={responded} onChange={(e) => setResponded(e.target.value)} className={inputCls}>
              <option value="">All</option>
              <option value="yes">Responded &mdash; Yes</option>
              <option value="no">Not yet responded</option>
            </select>
          </label>
          <label className="block text-sm font-medium" htmlFor="response-method">Contact method
            <select id="response-method" value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
              <option value="">Any</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>
        <div className="flex items-end gap-2">
          <label className="block flex-1 text-sm font-medium" htmlFor="response-date">Date of drop
            <input id="response-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
          {(q || date || responded || method) && <button type="button" className={`${btn2Cls} mb-0.5`} onClick={() => { setQ(""); setTerm(""); setDate(""); setResponded(""); setMethod(""); }}>Clear</button>}
        </div>
      </div>

      {found.error && <Notice kind="error">{found.error}</Notice>}
      {!rows ? <p className="text-slate-500">Searching...</p> : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {searching
              ? rows.length === 0 ? "No letters match."
                : found.hasMore ? `Latest ${rows.length} matching letters. Add more words to narrow it down.`
                : `${rows.length} matching letter${rows.length === 1 ? "" : "s"}`
              : "Your latest letters"}
          </p>
          {rows.length === 0 && searching && (
            <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-slate-500">
              Check the office number, or try the company or building name. Clear the date if you are not sure of it.
            </p>
          )}
          <ul className="space-y-3">
            {rows.map((d) => <li key={d.id}><DropCard d={d} href={`/advisor/drop?id=${encodeURIComponent(d.id)}&from=responses`} /></li>)}
          </ul>
          {searching && <ShowMore hasMore={found.hasMore} loading={found.loading} onMore={found.more} />}
        </>
      )}
    </>
  );
}
