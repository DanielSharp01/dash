import { useId } from "react";
import { macroPresets, planAt } from "@dash/core";
import { useMe } from "../../queries/me.queries";
import { useOpen } from "../ui/useSteps";
import { averageOf, type Bucket, bucketLabels, chartFrame, type ChartSize, type Grouping, stepPath, useLastWeek } from "./goalDays";

export type MacroView = "all" | "protein" | "carbs" | "fat";

/** Macros on Goals: today's targets, how the week averaged, and each day's calories by macro. */
export function MacrosSection() {
  const open = useOpen();
  const { plan } = useMe();
  const { days, today, buckets } = useLastWeek();
  const current = days.at(-1)!.targets;
  // Today isn't over, so the averages only count finished days with something logged.
  const finished = days.filter((d) => d.date < today && d.totals);
  const average = (key: "protein" | "carbs" | "fat") => (finished.length ? Math.round(averageOf(finished, (d) => d.totals![key].value)) : undefined);
  const preset = macroPresets[planAt(plan).macroPlan.preset].label;
  const openChart = () => open("/goal/chart/macros");

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
          <button className="chip" onClick={openChart}>
            Full chart
          </button>
        </div>
        <MacroChart buckets={buckets} by="day" view="all" onOpen={openChart} />
      </section>
    </>
  );
}

const macroKcal = { protein: 4, carbs: 4, fat: 9 };
const macroColor = { protein: "var(--protein)", carbs: "var(--carbs)", fat: "var(--fat)" };

/** Round steps for the axis: a handful of lines whatever the unit. */
const axisStep = (top: number) => (top <= 300 ? 50 : top <= 600 ? 100 : top <= 2500 ? 500 : 1000);

/**
 * One bar a day or week (a week's is its daily average). All macros: stacked by calories, protein,
 * carbs, fat, then calories logged without macros, against the budget plus logged exercise and the
 * protein target. One macro: its grams against its target.
 */
export function MacroChart({ buckets, by, view, size, onOpen }: { buckets: Bucket[]; by: Grouping; view: MacroView; size?: ChartSize; onOpen?: () => void }) {
  const hatch = useId();
  const chart = chartFrame(size);
  const bars = buckets.map((b) => {
    const c = b.counted;
    // With nothing logged the bar is empty, but the target line still shows what applied.
    const targetDays = c.length ? c : b.days;
    const avg = (value: Parameters<typeof averageOf>[1]) => averageOf(c, value);
    if (view !== "all") {
      const grams = avg((d) => d.totals![view].value);
      return { b, segments: [grams], total: grams, missing: c.some((d) => d.totals![view].missing > 0), lines: [averageOf(targetDays, (d) => d.targets[view])] };
    }
    const [protein, carbs, fat] = (["protein", "carbs", "fat"] as const).map((key) => avg((d) => d.totals![key].value) * macroKcal[key]) as [number, number, number];
    const other = Math.max(0, avg((d) => d.totals!.kcal.value) - protein - carbs - fat);
    const missing = c.some((d) => d.totals!.kcal.missing > 0 || d.totals!.protein.missing > 0 || d.totals!.carbs.missing > 0 || d.totals!.fat.missing > 0);
    const budget = averageOf(targetDays, (d) => d.targets.kcal + (d.totals?.burned ?? 0));
    return { b, segments: [protein, carbs, fat, other], total: protein + carbs + fat + other, missing, lines: [budget, averageOf(targetDays, (d) => d.targets.protein) * 4] };
  });
  const top = Math.max(...bars.map((bar) => Math.max(bar.total, ...bar.lines)));
  const step = axisStep(top);
  const max = Math.ceil((top * 1.05) / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const slot = (chart.right - chart.left) / buckets.length;
  const barWidth = Math.max(slot * 0.62, 1);
  const y = (v: number) => chart.bottom - (v / max) * (chart.bottom - chart.top);
  const colors = view === "all" ? ["var(--protein)", "var(--carbs)", "var(--fat)", "var(--muted)"] : [macroColor[view]];
  const labels = bucketLabels(buckets, by, slot);
  const unit = view === "all" ? "Calories by macro" : `${view[0]!.toUpperCase()}${view.slice(1)} in grams`;

  return (
    <>
      <svg
        className={onOpen ? "weigh-trend chart-tap" : "weigh-trend"}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label={`${unit} per ${by}, against the ${view === "all" ? "budget" : "target"}`}
        onClick={onOpen}
      >
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
        {bars.map(({ b, segments, total, missing }, i) => {
          const x = chart.left + i * slot + (slot - barWidth) / 2;
          let base = 0;
          return (
            <g key={b.from} opacity={b.hasToday ? 0.5 : 1}>
              {segments.map((v, s) => {
                if (v <= 0) return null;
                const rect = <rect key={s} x={x} y={y(base + v)} width={barWidth} height={y(base) - y(base + v)} style={{ fill: colors[s] }} opacity={s === 3 ? 0.45 : 1} />;
                base += v;
                return rect;
              })}
              {missing && total > 0 && <rect x={x} y={y(total)} width={barWidth} height={y(0) - y(total)} fill={`url(#${hatch})`} />}
              {labels[i] && (
                <text x={labels[i].x} y={chart.height - 4} textAnchor={labels[i].anchor} className={b.hasToday && by === "day" ? "chart-label chart-label-today" : "chart-label"}>
                  {labels[i].text}
                </text>
              )}
            </g>
          );
        })}
        {view === "all" ? (
          <>
            <path d={stepPath(bars.map((bar) => bar.lines[0]!), slot, y)} fill="none" style={{ stroke: "var(--text)" }} strokeWidth="1.5" opacity={0.7} />
            <path d={stepPath(bars.map((bar) => bar.lines[1]!), slot, y)} fill="none" style={{ stroke: "var(--protein)" }} strokeWidth="1.5" strokeDasharray="4 3" />
          </>
        ) : (
          <path d={stepPath(bars.map((bar) => bar.lines[0]!), slot, y)} fill="none" style={{ stroke: "var(--text)" }} strokeWidth="1.5" opacity={0.7} />
        )}
      </svg>
      {view === "all" ? (
        <ul className="chart-legend">
          <li className="legend-protein">Protein</li>
          <li className="legend-carbs">Carbs</li>
          <li className="legend-fat">Fat</li>
          <li className="legend-other">No macros</li>
          <li className="legend-line">Budget + exercise</li>
          <li className="legend-line legend-protein-line">Protein target</li>
        </ul>
      ) : (
        <ul className="chart-legend">
          <li className={`legend-${view}`}>{`${view[0]!.toUpperCase()}${view.slice(1)}`}, g</li>
          <li className="legend-line">Target</li>
        </ul>
      )}
    </>
  );
}
