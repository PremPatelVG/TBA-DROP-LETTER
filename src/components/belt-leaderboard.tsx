"use client";
import { type Belt, BELTS, beltFor, nextBelt } from "@/lib/belts";
import type { LeaderboardRow } from "@/lib/data";

/** Coloured belt badge. The belt name is always shown as text, so colour is never the only signal. */
export function BeltChip({ belt, size = "sm" }: { belt: Belt; size?: "sm" | "lg" }) {
  const pad = size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${pad} ${belt.chip}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${belt.dot}`} aria-hidden />
      {belt.name}
    </span>
  );
}

const byEntries = (a: LeaderboardRow, b: LeaderboardRow) => b.weekEntries - a.weekEntries || a.full_name.localeCompare(b.full_name);

/** How many advisors sit in each belt, highest belt first. */
function distribution(rows: LeaderboardRow[]) {
  return [...BELTS].reverse().map((belt) => ({ belt, count: rows.filter((r) => beltFor(r.weekEntries).key === belt.key).length }));
}

/** Ranked list of advisors by entries this week, each with a belt badge. `meId` highlights one row. */
function LeaderboardList({ rows, meId }: { rows: LeaderboardRow[]; meId?: string }) {
  const ranked = [...rows].sort(byEntries);
  if (!ranked.length) return <p className="rounded-lg border border-dashed bg-white p-8 text-center text-slate-500">No advisors yet.</p>;
  return (
    <ol className="divide-y overflow-hidden rounded-lg border bg-white">
      {ranked.map((r, i) => {
        const belt = beltFor(r.weekEntries);
        const me = r.advisorId === meId;
        return (
          <li key={r.advisorId} className={`flex items-center gap-3 p-3 ${me ? "border-l-4 border-green-600 bg-green-50" : ""}`}>
            <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {r.full_name}
                {r.advisor_code && <span className="ml-1 font-mono text-xs text-slate-500">{r.advisor_code}</span>}
                {me && <span className="ml-2 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">You</span>}
              </p>
              <p className="truncate text-xs text-slate-500">{r.region ?? "—"}</p>
            </div>
            <BeltChip belt={belt} />
            <div className="w-16 shrink-0 text-right">
              <p className="text-base font-semibold tabular-nums">{r.weekEntries.toLocaleString("en-IN")}</p>
              <p className="text-[11px] text-slate-500">this week</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Small row of "N at Red belt" chips summarising the field. */
function BeltLegend({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {distribution(rows).map(({ belt, count }) => (
        <span key={belt.key} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${belt.chip}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${belt.dot}`} aria-hidden />
          {count} · {belt.name}
        </span>
      ))}
    </div>
  );
}

const WEEK_NOTE = "Belts are set by entries this week (the competition week runs Sunday noon to Sunday noon, IST). One drop entry is one letter.";

/** Ops/master view: every advisor ranked by entries this week, with a belt-distribution summary. */
export function OpsBeltLeaderboard({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">Belt leaderboard</h2>
      <p className="mb-3 text-sm text-slate-600">{WEEK_NOTE}</p>
      <BeltLegend rows={rows} />
      <LeaderboardList rows={rows} />
    </section>
  );
}

/**
 * Advisor view: the signed-in advisor's own belt and progress (from their own weekly count, which always
 * loads), then the ranked board with their row marked. The board list is shown only when `rows` is
 * available — in the real app an advisor may not be allowed to read every advisor's counts.
 */
export function AdvisorBeltPanel({ myEntries, rows, meId }: { myEntries: number; rows: LeaderboardRow[]; meId: string }) {
  const belt = beltFor(myEntries);
  const next = nextBelt(myEntries);
  const ranked = [...rows].sort(byEntries);
  const rank = ranked.findIndex((r) => r.advisorId === meId) + 1;
  return (
    <section className="mb-6">
      <div className={`mb-4 rounded-lg border border-l-4 border-l-green-600 bg-white p-4 ${belt.tint}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your belt this week</p>
            <div className="mt-1"><BeltChip belt={belt} size="lg" /></div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums leading-none">{myEntries.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-xs text-slate-500">entries this week</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          {next
            ? <>{next.needed.toLocaleString("en-IN")} more {next.needed === 1 ? "entry" : "entries"} to reach the <span className="font-semibold">{next.belt.name}</span>.</>
            : <>Top belt — you are at the <span className="font-semibold">Green belt</span>. Keep it up!</>}
          {rank > 0 && <span className="text-slate-500"> · Rank #{rank} of {ranked.length}</span>}
        </p>
      </div>
      {ranked.length > 0 && (
        <>
          <h2 className="mb-1 text-lg font-semibold">Belt leaderboard</h2>
          <p className="mb-3 text-sm text-slate-600">{WEEK_NOTE}</p>
          <LeaderboardList rows={rows} meId={meId} />
        </>
      )}
    </section>
  );
}
