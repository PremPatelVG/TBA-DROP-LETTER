"use client";
import { useEffect, useMemo, useState } from "react";
import { api, type Cursor, type Drop, type DropCounts, type DropFilter, type Profile } from "@/lib/data";
import { cityKey } from "@/lib/search";
import { rate } from "@/lib/stats";
import { saveFile } from "@/lib/save-file";
import { btn2Cls, btnCls, dropBg, errMsg, inputCls, Notice, ShowMore, useData, useDropPages } from "@/components/ui";

const th = "p-3 font-medium";
const empty = { advisor: "", from: "", to: "", city: "", building: "", q: "", responded: "", method: "" };
const PAGE = 200;
const EXPORT_BATCH = 500;
const EXPORT_MAX = 50_000;

async function exportXlsx(rows: Drop[], advisors: Map<string, Profile>) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows.map((d) => ({
    "Drop date": d.drop_date,
    "Advisor ID": advisors.get(d.advisor_id)?.advisor_code ?? "",
    Advisor: advisors.get(d.advisor_id)?.full_name ?? "",
    "Office no.": d.office_number,
    Company: d.company_name,
    Building: d.building_name,
    "Block no.": d.block_no,
    Area: d.area ?? "",
    City: d.city ?? "",
    Address: d.full_address ?? "",
    Responded: d.responded ? "Yes" : "No",
    "Response type": d.response_type,
    "Response date": d.response_date ?? "",
    "Response phone": d.response_phone ?? "",
    "Response email": d.response_email ?? "",
    Notes: d.response_notes ?? "",
  })));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Drops");
  const filename = `tba-drops-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const data = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const status = await saveFile(filename, data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return { status, filename };
}

const plural = (n: number, word: string) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

export default function AllDrops() {
  const { data } = useData(async () => {
    const [advisors, buildings] = await Promise.all([api.listAdvisors(), api.listBuildings()]);
    return { advisors, buildings };
  });
  const [f, setF] = useState(empty);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const update = (patch: Partial<typeof empty>) => setF((cur) => ({ ...cur, ...patch }));
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update({ [k]: e.target.value });
  useEffect(() => {
    const t = setTimeout(() => setF((cur) => (cur.q === typed ? cur : { ...cur, q: typed })), 250);
    return () => clearTimeout(t);
  }, [typed]);

  const filter: DropFilter = {
    advisorId: f.advisor || undefined, from: f.from || undefined, to: f.to || undefined,
    city: f.city || undefined, building: f.building || undefined, q: f.q.trim() || undefined,
    responded: f.responded ? f.responded === "yes" : undefined,
    method: (f.method || undefined) as DropFilter["method"],
  };
  const key = JSON.stringify(filter);
  const page = useDropPages(filter, PAGE);
  // Exact totals come from count queries; they are not available when part of the search is checked in the app.
  const [counts, setCounts] = useState<{ key: string; value: DropCounts | null } | null>(null);
  useEffect(() => {
    let live = true;
    api.countDrops(JSON.parse(key)).then((value) => live && setCounts({ key, value }), () => live && setCounts({ key, value: null }));
    return () => { live = false; };
  }, [key]);
  const c = counts?.key === key ? counts.value : undefined;

  const advisorMap = useMemo(() => new Map((data?.advisors ?? []).map((a) => [a.id, a])), [data]);
  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of data?.buildings ?? []) { const k = cityKey(b.city); if (k && !seen.has(k)) seen.set(k, b.city!); }
    return [...seen.values()].sort();
  }, [data]);
  const buildingsList = useMemo(() => (data?.buildings ?? [])
    .filter((b) => !f.city || cityKey(b.city) === cityKey(f.city)).map((b) => b.name), [data, f.city]);

  async function exportAll() {
    setErr(null);
    setExported(null);
    setExporting(true);
    try {
      const rows: Drop[] = [];
      let cursor: Cursor | null = null;
      do {
        const p = await api.findDrops(filter, { limit: EXPORT_BATCH, cursor });
        rows.push(...p.rows);
        cursor = p.cursor;
      } while (cursor && rows.length < EXPORT_MAX);
      if (!rows.length) setExported("Nothing to export.");
      else {
        const r = await exportXlsx(rows, advisorMap);
        setExported(r.status === "saved" ? `Exported ${plural(rows.length, "row")} to ${r.filename}.` : "Export cancelled.");
      }
    } catch (e) {
      setErr(errMsg(e));
    }
    setExporting(false);
  }

  if (!data) return <p className="text-slate-500">Loading...</p>;
  const rows = page.rows;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">All drops</h1>
          <p className="text-sm text-slate-600 tabular-nums">
            {c ? `${plural(c.letters, "letter")} · ${plural(c.responses, "response")} (${rate(c.responses, c.letters)}%)`
              : rows && c === null ? `${plural(rows.length, "letter")}${page.hasMore ? "+" : ""} shown (totals need a single search word)`
              : "Counting..."}
          </p>
        </div>
        <button className={btnCls} disabled={exporting || !rows?.length} onClick={exportAll}>{exporting ? "Exporting..." : "Export to Excel"}</button>
      </div>
      {(err || page.error) && <div className="mb-4"><Notice kind="error">{err ?? page.error}</Notice></div>}
      {exported && <div className="mb-4"><Notice kind="ok">{exported}</Notice></div>}

      <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border bg-white p-4 md:grid-cols-3 lg:grid-cols-6">
        <label className="col-span-2 block text-sm font-medium md:col-span-3 lg:col-span-6" htmlFor="ops-search">Search
          <input id="ops-search" type="search" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
            placeholder="Office no., company or building, e.g. 301 vasant" className={inputCls} />
        </label>
        <label className="col-span-2 block text-sm font-medium md:col-span-1 lg:col-span-2">Advisor
          <select value={f.advisor} onChange={set("advisor")} className={inputCls}>
            <option value="">All advisors</option>
            {data.advisors.map((a) => <option key={a.id} value={a.id}>{a.advisor_code} · {a.full_name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">From<input type="date" value={f.from} onChange={set("from")} className={inputCls} /></label>
        <label className="block text-sm font-medium">To<input type="date" value={f.to} onChange={set("to")} className={inputCls} /></label>
        <label className="block text-sm font-medium">City
          <select value={f.city} onChange={(e) => update({ city: e.target.value, building: "" })} className={inputCls}>
            <option value="">All</option>{cities.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Building
          <select value={f.building} onChange={set("building")} className={inputCls}>
            <option value="">All</option>{buildingsList.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Response
          <select value={f.responded} onChange={set("responded")} className={inputCls}>
            <option value="">All</option>
            <option value="yes">Responded &mdash; Yes</option>
            <option value="no">Not yet responded</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Contact method
          <select value={f.method} onChange={set("method")} className={inputCls}>
            <option value="">Any</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="none">None</option>
          </select>
        </label>
        <div className="col-span-2 md:col-span-3 lg:col-span-6">
          <button className={btn2Cls} onClick={() => { setTyped(""); setF(empty); }}>Clear filters</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>
            <th className={th}>Date</th><th className={th}>Advisor</th><th className={th}>Office</th><th className={th}>Company</th>
            <th className={th}>Building</th><th className={th}>Block</th><th className={th}>Area / City</th><th className={th}>Response</th>
            <th className={th}>Responder phone</th><th className={th}>Responder email</th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className={`border-t ${dropBg(r.responded)}`}>
                <td className="whitespace-nowrap p-3">{r.drop_date}</td>
                <td className="whitespace-nowrap p-3">{advisorMap.get(r.advisor_id)?.full_name} <span className="text-slate-500">{advisorMap.get(r.advisor_id)?.advisor_code}</span></td>
                <td className="whitespace-nowrap p-3 font-medium tabular-nums">{r.office_number}</td>
                <td className="p-3">{r.company_name}</td>
                <td className="p-3">{r.building_name}</td>
                <td className="p-3">{r.block_no}</td>
                <td className="p-3">{[r.area, r.city].filter(Boolean).join(", ") || "-"}</td>
                <td className="whitespace-nowrap p-3">{r.responded ? <span className="font-medium text-green-700">{r.response_type} · {r.response_date}</span> : "-"}</td>
                <td className="whitespace-nowrap p-3 tabular-nums">{r.response_phone ?? (r.responded ? "-" : "")}</td>
                <td className="p-3 break-all">{r.response_email ?? (r.responded ? "-" : "")}</td>
              </tr>
            ))}
            {!rows && <tr><td colSpan={10} className="p-6 text-center text-slate-500">Loading...</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-500">No drops match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <ShowMore hasMore={page.hasMore} loading={page.loading} onMore={page.more} left={c && rows ? c.letters - rows.length : null} />
    </>
  );
}
