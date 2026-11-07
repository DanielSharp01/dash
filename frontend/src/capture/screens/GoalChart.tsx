import { useState } from "react";
import { BEGINNING, daysBetween, formatFluid, meanAndSpread, type PlanAreas, planAt, shiftDate, toDateKey, type WeighIn } from "@dash/core";
import { Navigate, useParams } from "react-router";
import { useMe } from "../../queries/me.queries";
import { useWeighIns } from "../../queries/weighIns.queries";
import { targetDate } from "../body";
import { todayKey } from "../time";
import { DateChip } from "../ui/DateChip";
import { FlowShell } from "../ui/FlowShell";
import { useSteps } from "../ui/useSteps";
import { FluidChart } from "./Fluid";
import { averageOf, bucketsOf, type GoalDay, type Grouping, useGoalDays } from "./goalDays";
import { MacroChart, type MacroView } from "./Macros";
import { useLoggedWeight, WeightChart, WeightStats } from "./Weight";

const chartAreas = { weight: "Weight trend", macros: "Macros", fluid: "Fluid intake" };
type ChartArea = keyof typeof chartAreas;
const isChartArea = (a: string | undefined): a is ChartArea => !!a && a in chartAreas;

type Span = { from: string; to: string };
type QuickPick = { key: string; label: string; span: Span; goal?: true };
const sameSpan = (a: Span, b: Span) => a.from === b.from && a.to === b.to;
const defaultPick: Record<ChartArea, string> = { weight: "3m", macros: "1m", fluid: "1m" };
// Daily bars over more than three months are too thin to read.
const defaultGrouping = (span: Span): Grouping => (daysBetween(span.from, span.to) > 91 ? "week" : "day");

const macroViews: { view: MacroView; label: string }[] = [
  { view: "all", label: "All" },
  { view: "protein", label: "Protein" },
  { view: "carbs", label: "Carbs" },
  { view: "fat", label: "Fat" },
];

/**
 * The past picks run to today, empty where nothing was logged yet. The current goal starts where it
 * was last set (or at the first weigh-in if it never was); only Until goal runs ahead, to the day the
 * pace reaches the target.
 */
function quickPicks(area: ChartArea, plan: PlanAreas, weighIns: WeighIn[], today: string): QuickPick[] {
  const set = plan.goal.at(-1)!.from;
  const goalStart = set === BEGINNING ? (weighIns[0]?.date ?? shiftDate(today, -13)) : set;
  const latest = weighIns.at(-1);
  const reached = latest && targetDate(latest.kg, planAt(plan).goal);
  return [
    { key: "2w", label: "2 weeks", span: { from: shiftDate(today, -13), to: today } },
    { key: "1m", label: "1 month", span: { from: shiftDate(today, -29), to: today } },
    { key: "3m", label: "3 months", span: { from: shiftDate(today, -90), to: today } },
    { key: "goal", label: "Current goal", goal: true, span: { from: goalStart < today ? goalStart : shiftDate(today, -13), to: today } },
    ...(area === "weight" && reached ? [{ key: "until", label: "Until goal", goal: true as const, span: { from: goalStart, to: toDateKey(reached) } }] : []),
  ];
}

export function GoalChartRoute() {
  const { area } = useParams();
  if (!isChartArea(area)) return <Navigate to="/goal" replace />;
  return <GoalChart key={area} area={area} />;
}

/** One Goals chart over a chosen stretch, by day or by week, with what that stretch averaged. */
function GoalChart({ area }: { area: ChartArea }) {
  const { close } = useSteps<"chart">("chart", undefined, "/goal");
  const { plan } = useMe();
  const weighIns = useWeighIns();
  const today = todayKey();
  const picks = quickPicks(area, plan, weighIns, today);
  const [span, setSpan] = useState(picks.find((p) => p.key === defaultPick[area])!.span);
  const [by, setBy] = useState(defaultGrouping(span));
  const [view, setView] = useState<MacroView>("all");
  const show = (next: Span) => {
    setSpan(next);
    setBy(defaultGrouping(next));
  };

  return (
    <FlowShell title={chartAreas[area]} canGoBack onBack={close} onClose={close}>
      <div className="chart-controls">
        {[picks.filter((p) => !p.goal), picks.filter((p) => p.goal)].map((row) => (
          <div key={row[0]!.key} className="segmented small" role="radiogroup" aria-label={row[0]!.goal ? "Goal range" : "Recent range"}>
            {row.map((p) => (
              <button key={p.key} role="radio" aria-selected={sameSpan(p.span, span)} onClick={() => show(p.span)}>
                {p.label}
              </button>
            ))}
          </div>
        ))}
        <div className={`segmented small chart-span${picks.some((p) => sameSpan(p.span, span)) ? "" : " custom"}`} role="group" aria-label="Dates">
          <DateChip prefix="From" value={span.from} max={span.to} onChange={(from) => show({ ...span, from })} />
          <DateChip prefix="to" value={span.to} min={span.from} max={area === "weight" ? undefined : today} onChange={(to) => show({ ...span, to })} />
        </div>
        <div className="segmented small" role="radiogroup" aria-label="Each point is">
          {(["day", "week"] as const).map((g) => (
            <button key={g} role="radio" aria-selected={g === by} onClick={() => setBy(g)}>
              {g === "day" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
        {area === "macros" && (
          <div className="segmented small" role="radiogroup" aria-label="Macros shown">
            {macroViews.map((m) => (
              <button key={m.view} role="radio" aria-selected={m.view === view} onClick={() => setView(m.view)}>
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <section className="goal-card">{area === "weight" ? <FullWeightChart span={span} by={by} /> : <FullBarChart area={area} span={span} by={by} view={view} />}</section>
    </FlowShell>
  );
}

function FullWeightChart({ span, by }: { span: Span; by: Grouping }) {
  const { profile, plan } = useMe();
  const all = useWeighIns();
  const today = todayKey();
  const logged = useLoggedWeight(all, span.from, today)?.filter((p) => p.date <= span.to);
  return (
    <>
      <WeightStats weighIns={all.filter((w) => w.date >= span.from && w.date <= span.to)} logged={logged} goal={planAt(plan).goal} units={profile.units} />
      <WeightChart weighIns={all} history={plan} units={profile.units} today={today} logged={logged} by={by} tall {...span} />
    </>
  );
}

function FullBarChart({ area, span, by, view }: { area: "macros" | "fluid"; span: Span; by: Grouping; view: MacroView }) {
  const { profile } = useMe();
  const today = todayKey();
  const days = useGoalDays(span.from, span.to);
  const buckets = bucketsOf(days, by, today);
  if (area === "fluid") {
    return (
      <>
        <AverageStats days={days} today={today} value={(d) => d.totals!.fluid.value} target={(d) => d.targets.fluidMl} format={(ml) => (profile.units === "metric" ? `${(ml / 1000).toFixed(1)} L` : formatFluid(ml, profile.units))} />
        <FluidChart buckets={buckets} by={by} units={profile.units} tall />
      </>
    );
  }
  return (
    <>
      <MacroStats days={days} today={today} view={view} />
      <MacroChart buckets={buckets} by={by} view={view} tall />
    </>
  );
}

function MacroStats({ days, today, view }: { days: GoalDay[]; today: string; view: MacroView }) {
  if (view === "all") {
    const kcal = (n: number) => `${Math.round(n).toLocaleString()} kcal`;
    return <AverageStats days={days} today={today} value={(d) => d.totals!.kcal.value} target={(d) => d.targets.kcal + (d.totals?.burned ?? 0)} format={kcal} targetLabel="Budget" />;
  }
  return <AverageStats days={days} today={today} value={(d) => d.totals![view].value} target={(d) => d.targets[view]} format={(g) => `${Math.round(g)} g`} />;
}

/**
 * What the stretch averaged a day, give or take its standard deviation, against the target. Only
 * finished days with something logged count, as on the overview; the target averages over them too.
 */
function AverageStats({
  days,
  today,
  value,
  target,
  format,
  targetLabel = "Target",
}: {
  days: GoalDay[];
  today: string;
  value: (d: GoalDay) => number;
  target: (d: GoalDay) => number;
  format: (n: number) => string;
  targetLabel?: string;
}) {
  const finished = days.filter((d) => d.date < today);
  const logged = finished.filter((d) => d.totals);
  const stats = meanAndSpread(logged.map(value));
  return (
    <dl className="stat-row">
      <div>
        <dt>Average</dt>
        <dd>{stats ? format(stats.mean) : "—"}</dd>
        <dd className="stat-sub">{stats ? `± ${format(stats.spread)}` : " "}</dd>
      </div>
      <div>
        <dt>{targetLabel}</dt>
        <dd>{finished.length ? format(averageOf(logged.length ? logged : finished, target)) : "—"}</dd>
        <dd className="stat-sub">a day</dd>
      </div>
      <div>
        <dt>Logged</dt>
        <dd>
          {logged.length} of {finished.length}
        </dd>
        <dd className="stat-sub">days</dd>
      </div>
    </dl>
  );
}
