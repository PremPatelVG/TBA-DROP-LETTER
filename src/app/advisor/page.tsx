"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, type LeaderboardRow } from "@/lib/data";
import { currentWeek, rate } from "@/lib/stats";
import { btnCls, DropCard, Notice, ShowMore, StatCards, useData, useDropPages, useUser } from "@/components/ui";
import { AdvisorBeltPanel } from "@/components/belt-leaderboard";

const PAGE = 30;
const NO_FILTER = {};

function Saved() {
  return useSearchParams().get("saved") ? <div className="mb-4"><Notice kind="ok">Saved.</Notice></div> : null;
}

export default function AdvisorHome() {
  const user = useUser();
  const week = currentWeek();
  const { data } = useData(async () => {
    const summary = await api.advisorSummary(user.id, week);
    // The leaderboard needs every advisor's weekly count. An advisor may not be allowed to read that in the
    // real app, so if it is refused we still show their own belt (from their own summary) and skip the list.
    let board: LeaderboardRow[] = [];
    try { board = await api.beltLeaderboard(week); } catch { /* not permitted: own belt only */ }
    return { summary, board };
  });
  const drops = useDropPages(NO_FILTER, PAGE);
  if (!data) return <p className="text-slate-500">Loading...</p>;
  const { summary: s, board } = data;

  return (
    <>
      <Suspense><Saved /></Suspense>
      <h1 className="mb-4 text-xl font-semibold">My dashboard</h1>
      {s ? (
        <StatCards t={{ letters: s.letters, buildings: s.buildings, responses: s.responses, rate: rate(s.responses, s.letters) }} compact />
      ) : (
        <div className="mb-6"><Notice kind="info">Totals and weekly progress need an internet connection. Your drops below still work offline.</Notice></div>
      )}
      {s && <AdvisorBeltPanel myEntries={s.weekLetters} rows={board} meId={user.id} />}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">My drops</h2>
          <p className="text-sm text-slate-600">{s ? `${s.letters.toLocaleString("en-IN")} letters · ` : ""}tap one to log a response</p>
        </div>
        <Link href="/advisor/drops/new" className={`${btnCls} shrink-0 whitespace-nowrap`}>+ New drop</Link>
      </div>
      {drops.error && <div className="mb-4"><Notice kind="error">{drops.error}</Notice></div>}
      {!drops.rows ? <p className="text-slate-500">Loading...</p> : drops.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-white p-8 text-center text-slate-500">No drops yet. Add your first one.</p>
      ) : (
        <>
          <ul className="space-y-3">
            {drops.rows.map((d) => <li key={d.id}><DropCard d={d} href={`/advisor/drop?id=${encodeURIComponent(d.id)}`} /></li>)}
          </ul>
          <ShowMore hasMore={drops.hasMore} loading={drops.loading} onMore={drops.more} left={s ? s.letters - drops.rows.length : null} />
        </>
      )}
    </>
  );
}
