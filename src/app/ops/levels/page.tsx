"use client";
import { useState } from "react";
import { api, type Level } from "@/lib/data";
import { btn2Cls, cardCls, errMsg, inputCls, Notice, useData } from "@/components/ui";
// The same rules module the weekly Cloud Function uses.
import { DEMOTE_AFTER_WEEKS, PROMOTE_AFTER_WEEKS } from "../../../../functions/src/levels/rules";

export default function Levels() {
  const { data, reload } = useData(async () => {
    const [levels, history, advisors] = await Promise.all([api.listLevels(), api.listLevelHistory(), api.listAdvisors()]);
    return { levels, history, advisors };
  });
  if (!data) return <p className="text-slate-500">Loading...</p>;
  const lvl = (id: number | null) => data.levels.find((l) => l.id === id)?.name ?? "-";
  const adv = (id: string) => data.advisors.find((a) => a.id === id);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Target levels</h1>
      <p className="mb-2 text-sm text-slate-600">Letters per week (the competition week runs Sunday 12:00 noon to Sunday 12:00 noon, India time) each level is expected to drop. Change an advisor&apos;s level on the Advisors page.</p>
      <p className="mb-4 text-sm text-slate-600">
        Automatic weekly check, every Sunday at 12:00 noon (India time), for the week that just ended: an advisor who meets their
        target {PROMOTE_AFTER_WEEKS} weeks in a row moves up one level; an advisor above Level 1 who misses it {DEMOTE_AFTER_WEEKS} weeks
        in a row moves down one level (never below Level 1). Every change is listed below.
      </p>
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {data.levels.map((l) => (
          <LevelCard key={l.id} level={l} count={data.advisors.filter((a) => a.level_id === l.id).length} onDone={reload} />
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Level change history</h2>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>
            <th className="p-3 font-medium">When</th><th className="p-3 font-medium">Advisor</th><th className="p-3 font-medium">From</th>
            <th className="p-3 font-medium">To</th><th className="p-3 font-medium">By</th><th className="p-3 font-medium">Reason</th>
          </tr></thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.id} className="border-t">
                <td className="whitespace-nowrap p-3">{new Date(h.changed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="p-3">{adv(h.advisor_id)?.full_name} <span className="font-mono text-slate-500">{adv(h.advisor_id)?.advisor_code}</span></td>
                <td className="p-3">{lvl(h.from_level_id)}</td><td className="p-3">{lvl(h.to_level_id)}</td>
                <td className="whitespace-nowrap p-3">{h.changed_by === "weekly-job" ? "Weekly check" : "Manual"}</td>
                <td className="p-3">{h.reason ?? "-"}</td>
              </tr>
            ))}
            {data.history.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No changes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LevelCard({ level, count, onDone }: { level: Level; count: number; onDone: () => void }) {
  const [value, setValue] = useState(String(level.target_letters));
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const dirty = value !== String(level.target_letters);
  async function save() {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return setMsg({ kind: "error", text: "Enter a positive whole number." });
    try {
      await api.updateLevelTarget(level.id, n);
      setMsg({ kind: "ok", text: "Saved." });
      onDone();
    } catch (e) {
      setMsg({ kind: "error", text: errMsg(e) });
    }
  }
  return (
    <div className={`${cardCls} space-y-3 p-4`}>
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">{level.name}</p>
        <p className="text-xs text-slate-500">{count} advisor{count === 1 ? "" : "s"}</p>
      </div>
      <label className="block text-sm font-medium">Target letters / week
        <input type="number" min={1} step={1} inputMode="numeric" value={value} onChange={(e) => { setValue(e.target.value); setMsg(null); }} className={inputCls} />
      </label>
      <button className={btn2Cls} disabled={!dirty} onClick={save}>Save</button>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}
