"use client";

type Row = { key: string; label: string; letters: number; responses: number; rate: number };

/** Month-wise letters (bars) with responses and rate listed underneath each bar. */
export function MonthChart({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.letters));
  return (
    <figure>
      <div className="flex h-48 items-end gap-2 sm:gap-4" role="img"
        aria-label={`Letters dropped per month: ${rows.map((r) => `${r.label} ${r.letters}`).join(", ")}`}>
        {rows.map((r) => (
          <div key={r.key} className="flex h-full flex-1 flex-col justify-end text-center">
            <span className="mb-1 text-xs font-medium tabular-nums text-slate-700">{r.letters}</span>
            <div className="w-full rounded-t bg-green-600" style={{ height: `${(r.letters / max) * 85}%`, minHeight: r.letters ? 2 : 0 }}
              title={`${r.label}: ${r.letters} letters, ${r.responses} responses`} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t pt-2 sm:gap-4">
        {rows.map((r) => (
          <div key={r.key} className="flex-1 text-center text-xs">
            <p className="font-medium text-slate-700">{r.label}</p>
            <p className="text-slate-500 tabular-nums">{r.responses} resp.</p>
            <p className="text-slate-500 tabular-nums">{r.rate}%</p>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-slate-500">Bars: letters dropped (one entry is one letter). Below: responses and response rate (responses / letters).</figcaption>
    </figure>
  );
}
