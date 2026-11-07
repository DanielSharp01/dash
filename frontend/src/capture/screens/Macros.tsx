import { useId } from "react";
import { macroPresets, planAt } from "@dash/core";
import { useMe } from "../../queries/me.queries";
import { useOpen } from "../ui/useSteps";
import { chart, dayTick, type GoalDay, stepPath, useGoalDays } from "./goalDays";

/** Macros on Goals: today's targets, how the week averaged, and each day's calories by macro. */
export function MacrosSection() {
  const open = useOpen();
  const { plan } = useMe();
  const { days, today, finished } = useGoalDays();
  const current = days.at(-1)!.targets;
  const average = (key: "protein" | "carbs" | "fat") => (finished.length ? Math.round(finished.reduce((sum, d) => sum + d.totals![key].value, 0) / finished.length) : undefined);
  const preset = macroPresets[planAt(plan).macroPlan.preset].label;

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

/**
 * One bar a day, stacked by calories: protein, carbs, fat, then calories logged without macros, so
 * the height is everything eaten. Lines: the budget plus that day's logged exercise, and protein.
 */
function MacroChart({ days, today }: { days: GoalDay[]; today: string }) {
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
  const slot = (chart.right - chart.left) / days.length;
  const barWidth = slot * 0.62;
  const y = (kcal: number) => chart.bottom - (kcal / max) * (chart.bottom - chart.top);
  const colors = ["var(--protein)", "var(--carbs)", "var(--fat)", "var(--muted)"];

  return (
    <>
      <svg className="weigh-trend" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`Calories by macro over the last ${days.length} days, against the budget`}>
        <defs>
          <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "var(--surface)" }} strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={chart.left} x2={chart.right} y1={y(v)} y2={y(v)} style={{ stroke: "var(--line)" }} />
            <text x={chart.left - 6} y={y(v) + 4} textAnchor="end" className="chart-label">
              {v >= 1000 ? `${v / 1000}k` : v}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = chart.left + i * slot + (slot - barWidth) / 2;
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
              <text x={chart.left + (i + 0.5) * slot} y={chart.height - 4} textAnchor="middle" className={b.date === today ? "chart-label chart-label-today" : "chart-label"}>
                {dayTick(b.date)}
              </text>
            </g>
          );
        })}
        <path d={stepPath(bars.map((b) => b.budget), slot, y)} fill="none" style={{ stroke: "var(--text)" }} strokeWidth="1.5" opacity={0.7} />
        <path d={stepPath(bars.map((b) => b.proteinLine), slot, y)} fill="none" style={{ stroke: "var(--protein)" }} strokeWidth="1.5" strokeDasharray="4 3" />
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
