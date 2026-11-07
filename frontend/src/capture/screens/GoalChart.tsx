import { useState } from "react";
import { shiftDate } from "@dash/core";
import { Navigate, useParams } from "react-router";
import { useMe } from "../../queries/me.queries";
import { useWeighIns } from "../../queries/weighIns.queries";
import { todayKey } from "../time";
import { FlowShell } from "../ui/FlowShell";
import { useSteps } from "../ui/useSteps";
import { FluidChart } from "./Fluid";
import { bucketsOf, type Grouping, useGoalDays } from "./goalDays";
import { MacroChart, type MacroView } from "./Macros";
import { chartRange, useLoggedWeight, WeightChart } from "./Weight";

const chartAreas = { weight: "Weight trend", macros: "Macros", fluid: "Fluid intake" };
type ChartArea = keyof typeof chartAreas;
const isChartArea = (a: string | undefined): a is ChartArea => !!a && a in chartAreas;

const ranges = [
  { key: "2w", label: "2W", name: "2 weeks", days: 14 },
  { key: "1m", label: "1M", name: "1 month", days: 30 },
  { key: "3m", label: "3M", name: "3 months", days: 91 },
  { key: "1y", label: "1Y", name: "1 year", days: 365 },
  { key: "all", label: "All", name: "Everything", days: Infinity },
] as const;
type Range = (typeof ranges)[number];
const defaultRange: Record<ChartArea, Range["key"]> = { weight: "3m", macros: "1m", fluid: "1m" };
// Daily bars over a year are too thin to read.
const defaultGrouping = (range: Range): Grouping => (range.days > 91 ? "week" : "day");

const macroViews: { view: MacroView; label: string }[] = [
  { view: "all", label: "All" },
  { view: "protein", label: "Protein" },
  { view: "carbs", label: "Carbs" },
  { view: "fat", label: "Fat" },
];

export function GoalChartRoute() {
  const { area } = useParams();
  if (!isChartArea(area)) return <Navigate to="/goal" replace />;
  return <GoalChart key={area} area={area} />;
}

/** One Goals chart over a chosen stretch, by day or by week. */
function GoalChart({ area }: { area: ChartArea }) {
  const { close } = useSteps<"chart">("chart", undefined, "/goal");
  const [range, setRange] = useState<Range>(ranges.find((r) => r.key === defaultRange[area])!);
  const [by, setBy] = useState(defaultGrouping(range));
  const [view, setView] = useState<MacroView>("all");
  const pickRange = (r: Range) => {
    setRange(r);
    setBy(defaultGrouping(r));
  };

  return (
    <FlowShell title={chartAreas[area]} canGoBack onBack={close} onClose={close}>
      <div className="chart-controls">
        <div className="segmented small" role="radiogroup" aria-label="Range">
          {ranges.map((r) => (
            <button key={r.key} role="radio" aria-label={r.name} aria-selected={r === range} onClick={() => pickRange(r)}>
              {r.label}
            </button>
          ))}
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
      <section className="goal-card">{area === "weight" ? <FullWeightChart days={range.days} by={by} /> : <FullBarChart area={area} days={range.days} by={by} view={view} />}</section>
    </FlowShell>
  );
}

function FullWeightChart({ days, by }: { days: number; by: Grouping }) {
  const { profile, plan } = useMe();
  const all = useWeighIns();
  const today = todayKey();
  const range = chartRange(all, today, days);
  const logged = useLoggedWeight(all, range.from, today);
  return <WeightChart weighIns={all} history={plan} units={profile.units} today={today} logged={logged} by={by} tall {...range} />;
}

/** Like the weight chart, no earlier than the first weigh-in: Goals tracking begins there, and it bounds what's fetched. */
function FullBarChart({ area, days, by, view }: { area: "macros" | "fluid"; days: number; by: Grouping; view: MacroView }) {
  const { profile } = useMe();
  const firstWeighIn = useWeighIns()[0]?.date;
  const today = todayKey();
  const earliest = Number.isFinite(days) ? shiftDate(today, -(days - 1)) : "";
  const from = firstWeighIn && firstWeighIn > earliest ? firstWeighIn : earliest || shiftDate(today, -364);
  const buckets = bucketsOf(useGoalDays(from, today), by, today);
  return area === "macros" ? <MacroChart buckets={buckets} by={by} view={view} tall /> : <FluidChart buckets={buckets} by={by} units={profile.units} tall />;
}
