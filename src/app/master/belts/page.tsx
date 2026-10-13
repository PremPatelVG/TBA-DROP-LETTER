"use client";
import { useState } from "react";
import { api } from "@/lib/data";
import { beltThresholdsError, BELT_TIERS, DEFAULT_BELT_THRESHOLDS, type BeltThresholds } from "@/lib/belts";
import { BeltChip } from "@/components/belt-leaderboard";
import { btnCls, cardCls, errMsg, inputCls, Notice, useData } from "@/components/ui";

/**
 * Master only (reached under /master, which requires the master role): view and edit the three belt boundaries.
 * The thresholds are stored as data; every belt computation — the leaderboards, the advisor dashboard and the
 * weekly snapshot — reads them, so a change here moves every advisor's belt at once. Non-master roles never see
 * this screen (the nav link is master-only and the route is behind the master layout's role guard).
 */
export default function BeltThresholdsPage() {
  const { data, error, reload } = useData(() => api.getBeltThresholds());
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <p className="text-slate-500">Loading...</p>;
  return <Editor initial={data} onSaved={reload} />;
}

const tierByKey = (key: string) => BELT_TIERS.find((t) => t.key === key)!;

/** The four belt ranges for a set of thresholds, as "low–high" / "min+" strings. */
function ranges(t: BeltThresholds) {
  const nf = (n: number) => n.toLocaleString("en-IN");
  return [
    { key: "red", text: `0 – ${nf(t.yellowMin - 1)}` },
    { key: "yellow", text: `${nf(t.yellowMin)} – ${nf(t.blueMin - 1)}` },
    { key: "blue", text: `${nf(t.blueMin)} – ${nf(t.greenMin - 1)}` },
    { key: "green", text: `${nf(t.greenMin)}+` },
  ];
}

function Editor({ initial, onSaved }: { initial: BeltThresholds; onSaved: () => void }) {
  const [yellowMin, setYellowMin] = useState(String(initial.yellowMin));
  const [blueMin, setBlueMin] = useState(String(initial.blueMin));
  const [greenMin, setGreenMin] = useState(String(initial.greenMin));
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  // A live set from the current inputs (NaN when a box is blank) for the preview and validation.
  const draft: BeltThresholds = { yellowMin: Number(yellowMin), blueMin: Number(blueMin), greenMin: Number(greenMin) };
  const draftError = beltThresholdsError(draft);
  const valid = !draftError;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = beltThresholdsError(draft);
    if (err) return setMsg({ kind: "error", text: err });
    setPending(true);
    setMsg(null);
    try {
      await api.setBeltThresholds(draft);
      setMsg({ kind: "ok", text: "Belt thresholds saved. Every advisor's belt is now ranked against the new boundaries." });
      onSaved();
    } catch (err2) {
      setMsg({ kind: "error", text: errMsg(err2) });
    }
    setPending(false);
  }

  function resetToDefaults() {
    setYellowMin(String(DEFAULT_BELT_THRESHOLDS.yellowMin));
    setBlueMin(String(DEFAULT_BELT_THRESHOLDS.blueMin));
    setGreenMin(String(DEFAULT_BELT_THRESHOLDS.greenMin));
    setMsg(null);
  }

  const numberField = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <label className="block text-sm font-medium">{label}<span className="text-red-500"> *</span>
      <input type="number" inputMode="numeric" min={1} step={1} value={value} onChange={(e) => set(e.target.value)} className={inputCls} />
      <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section>
        <h1 className="mb-1 text-xl font-semibold">Belt thresholds</h1>
        <p className="mb-4 text-sm text-slate-600">
          The entries-this-week needed for each belt. Only master can change these. Each must be a whole number
          above 0 and they must increase (Yellow start &lt; Blue start &lt; Green start). Red is everything below
          the Yellow start.
        </p>
        <form onSubmit={save} className={`${cardCls} space-y-4 p-4`}>
          {numberField("Yellow start", yellowMin, setYellowMin, "Fewer than this is a Red belt.")}
          {numberField("Blue start", blueMin, setBlueMin, "At least the Yellow start and below this is a Yellow belt.")}
          {numberField("Green start", greenMin, setGreenMin, "This and above is a Green belt; below it (to the Blue start) is Blue.")}
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          {!msg && draftError && <Notice kind="error">{draftError}</Notice>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !valid} className={`${btnCls} flex-1`}>{pending ? "Saving..." : "Save thresholds"}</button>
            <button type="button" onClick={resetToDefaults} className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium hover:bg-slate-100">Defaults</button>
          </div>
        </form>
      </section>
      <section>
        <h2 className="mb-1 text-lg font-semibold">Preview</h2>
        <p className="mb-3 text-sm text-slate-600">Entries this week in each belt with the values entered. One drop entry is one letter.</p>
        <ul className="divide-y overflow-hidden rounded-lg border bg-white">
          {(valid ? ranges(draft) : []).map(({ key, text }) => (
            <li key={key} className="flex items-center justify-between gap-3 p-3">
              <BeltChip belt={tierByKey(key)} size="lg" />
              <span className="font-semibold tabular-nums">{text}</span>
              <span className="text-xs text-slate-500">entries / week</span>
            </li>
          ))}
          {!valid && <li className="p-6 text-center text-sm text-slate-500">Enter valid, increasing thresholds to see the belt ranges.</li>}
        </ul>
      </section>
    </div>
  );
}
