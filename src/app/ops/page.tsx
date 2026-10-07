"use client";
import { api } from "@/lib/data";
import { currentWeek, rate } from "@/lib/stats";
import { MonthChart } from "@/components/month-chart";
import { OpsBeltLeaderboard } from "@/components/belt-leaderboard";
import { cardCls, Notice, StatCards, useData } from "@/components/ui";

export default function OpsDashboard() {
  const week = currentWeek();
  const { data, error } = useData(async () => {
    const advisors = await api.listAdvisors();
    const summary = await api.opsSummary(week, advisors.map((a) => a.id));
    return { advisors, summary };
  });
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <p className="text-slate-500">Loading...</p>;
  const { advisors, summary: s } = data;
  if (!s) return <Notice kind="info">The dashboard needs an internet connection.</Notice>;
  // Belt leaderboard rows from this week's per-advisor entry counts (one drop entry is one letter).
  const leaderboard = advisors.map((a) => ({
    advisorId: a.id, full_name: a.full_name, advisor_code: a.advisor_code, city: a.city, state: a.state,
    weekEntries: s.perAdvisor[a.id]?.weekLetters ?? 0,
  }));

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Operations dashboard</h1>
      <StatCards t={{ letters: s.letters, buildings: s.buildings, responses: s.responses, rate: rate(s.responses, s.letters) }} />

      <section className={`${cardCls} mb-6 p-4`}>
        <h2 className="mb-4 text-lg font-semibold">Month-wise analytics</h2>
        <MonthChart rows={s.months.map((m) => ({ ...m, rate: rate(m.responses, m.letters) }))} />
      </section>

      <OpsBeltLeaderboard rows={leaderboard} />
    </>
  );
}
