import { useId } from "react";
import { dailyTargets, type DailyTargets, type DayTotals, dayTotals, macroPresets, planAt, shiftDate } from "@dash/core";
import { useEntriesBetween } from "../../queries/entries.queries";
import { useFoodLookup } from "../../queries/foods.queries";
import { useMe } from "../../queries/me.queries";
import { useWeighIns } from "../../queries/weighIns.queries";
import { todayKey } from "../time";
import { useOpen } from "../ui/useSteps";

/** The overview's window; the full chart will offer others. */
const CHART_DAYS = 7;

type Day = { date: string; totals: DayTotals | undefined; targets: DailyTargets };

/** Macros on Goals: today's targets, how the last two weeks averaged, and each day's calories by macro. */
export function MacrosSection() {
  const open = useOpen();
  const { profile, plan: history } = useMe();
  const weighIns = useWeighIns();
  const foods = useFoodLookup();
  const today = todayKey();
  const from = shiftDate(today, -(CHART_DAYS - 1));
  const entries = useEntriesBetween(from, today).data ?? [];
  const days: Day[] = Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = shiftDate(from, i);
    const ofDay = entries.filter((e) => e.when.date === date);
    return { date, totals: ofDay.length ? dayTotals(ofDay, foods) : undefined, targets: dailyTargets(profile, history, weighIns, date) };
  });
  const current = days.at(-1)!.targets;
  // Today isn't over, so only finished days with something logged count toward the average.
  const finished = days.filter((d) => d.date < today && d.totals);
  const average = (key: "protein" | "carbs" | "fat") => (finished.length ? Math.round(finished.reduce((sum, d) => sum + d.totals![key].value, 0) / finished.length) : undefined);
  const preset = macroPresets[planAt(history).macroPlan.preset].label;

  return (
    <>
      <h2 className="list-heading">Macros · {preset}</h2>
      <section className="goal-card">
        <dl className="stat-row">
          {(["protein", "carbs", "fat"] as const).map((key) => (
            <div key={key} className={`stat-${key}`}>
              <dt>{key}</dt>
              <dd>{current[key]} g</dd>
              <dd className="stat-sub">{average(key) !== undefined ? `avg ${average(key)} g` : " "}</dd>
            </div>
          ))}
        </dl>
        <div className="card-actions">
          <button className="chip" onClick={() => open("/goal/macros")}>
            Edit macros
          </button>
        </div>
        <MacroChart days={days} today={today} />
      </section>
    </>
  );
}

const W = 340;
const H = 170;
const plot = { left: 34, right: W - 8, top: 8, bottom: H - 20 };

/**
 * One bar a day, stacked by calories: protein, carbs, fat, then calories logged without macros, so
 * the height is everything eaten. Dashed: the budget plus that day's logged exercise, and protein.
 */
function MacroChart({ days, today }: { days: Day[]; today: string }) {
  const hatch = useId();
  const bars = days.map((d) => {
    const t = d.totals;
    const protein = (t?.protein.value ?? 0) * 4;
    const carbs = (t?.carbs.value ?? 0) * 4;
    const fat = (t?.fat.value ?? 0) * 9;
    const other = Math.max(0, (t?.kcal.value ?? 0) - protein - carbs - fat);
    const missing = !!t && (t.kcal.missing > 0 || t.protein.missing > 0 || t.carbs.missing > 0 || t.fat.missing > 0);
    return { ...d, segments: [protein, carbs, fat, other], total: protein + carbs + fat + other, missing, budget: d.targets.kcal + (t?.burned ?? 0), proteinLine: d.targets.protein * 4 };
  });
  const top = Math.max(...bars.map((b) => Math.max(b.total, b.budget)));
  const step = top > 2500 ? 1000 : 500;
  const max = Math.ceil((top * 1.05) / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const slot = (plot.right - plot.left) / days.length;
  const barWidth = slot * 0.62;
  const y = (kcal: number) => plot.bottom - (kcal / max) * (plot.bottom - plot.top);
  const colors = ["var(--protein)", "var(--carbs)", "var(--fat)", "var(--muted)"];
  /** Flat across each day, stepping where the value changes, so a steady target reads as one line. */
  const steps = (value: (b: (typeof bars)[number]) => number) =>
    bars.flatMap((b, i) => [`${i === 0 ? "M" : "L"}${plot.left + i * slot},${y(value(b))}`, `L${plot.left + (i + 1) * slot},${y(value(b))}`]).join(" ");

  return (
    <>
      <svg className="weigh-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Calories by macro over the last ${days.length} days, against the budget`}>
        <defs>
          <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "var(--surface)" }} strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={plot.left} x2={plot.right} y1={y(v)} y2={y(v)} style={{ stroke: "var(--line)" }} />
            <text x={plot.left - 6} y={y(v) + 4} textAnchor="end" className="chart-label">
              {v >= 1000 ? `${v / 1000}k` : v}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = plot.left + i * slot + (slot - barWidth) / 2;
          let base = 0;
          return (
            <g key={b.date} opacity={b.date === today ? 0.5 : 1}>
              {b.segments.map((kcal, s) => {
                if (kcal <= 0) return null;
                const rect = <rect key={s} x={x} y={y(base + kcal)} width={barWidth} height={y(base) - y(base + kcal)} style={{ fill: colors[s] }} opacity={s === 3 ? 0.45 : 1} />;
                base += kcal;
                return rect;
              })}
              {b.missing && b.total > 0 && <rect x={x} y={y(b.total)} width={barWidth} height={y(0) - y(b.total)} fill={`url(#${hatch})`} />}
              <text x={plot.left + (i + 0.5) * slot} y={H - 4} textAnchor="middle" className={b.date === today ? "chart-label chart-label-today" : "chart-label"}>
                {new Date(`${b.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </text>
            </g>
          );
        })}
        <path d={steps((b) => b.budget)} fill="none" style={{ stroke: "var(--text)" }} strokeWidth="1.5" opacity={0.7} />
        <path d={steps((b) => b.proteinLine)} fill="none" style={{ stroke: "var(--protein)" }} strokeWidth="1.5" strokeDasharray="4 3" />
      </svg>
      <ul className="chart-legend">
        <li className="legend-protein">Protein</li>
        <li className="legend-carbs">Carbs</li>
        <li className="legend-fat">Fat</li>
        <li className="legend-other">No macros</li>
        <li className="legend-line">Budget + exercise</li>
        <li className="legend-line legend-protein-line">Protein target</li>
      </ul>
    </>
  );
}
