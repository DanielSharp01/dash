import { useId } from "react";
import { formatFluid, toDisplayFluid, type UnitSystem } from "@dash/core";
import { useProfile } from "../../queries/me.queries";
import { useOpen } from "../ui/useSteps";
import { chart, dayTick, type GoalDay, stepPath, useGoalDays } from "./goalDays";

/** Fluid on Goals: the daily target, how the week went, today so far, and a bar per day. */
export function FluidSection() {
  const open = useOpen();
  const { units } = useProfile();
  const { days, today, finished } = useGoalDays();
  const now = days.at(-1)!;
  const average = finished.length ? finished.reduce((sum, d) => sum + d.totals!.fluid.value, 0) / finished.length : undefined;
  const sofar = now.totals?.fluid;

  return (
    <>
      <h2 className="list-heading">Fluid intake</h2>
      <section className="goal-card">
        <dl className="stat-row">
          <div className="stat-fluid">
            <dt>Target</dt>
            <dd>{formatFluid(now.targets.fluidMl, units)}</dd>
            <dd className="stat-sub">a day</dd>
          </div>
          <div>
            <dt>Week avg</dt>
            <dd>{average !== undefined ? formatFluid(average, units) : "—"}</dd>
            <dd className="stat-sub">{average !== undefined ? "a day" : " "}</dd>
          </div>
          <div>
            <dt>Today</dt>
            <dd>
              {sofar?.missing ? "≥ " : ""}
              {formatFluid(sofar?.value ?? 0, units)}
            </dd>
            <dd className="stat-sub">so far</dd>
          </div>
        </dl>
        <div className="card-actions">
          <button className="chip" onClick={() => open("/goal/fluid")}>
            Edit fluid
          </button>
        </div>
        <FluidChart days={days} today={today} units={units} />
      </section>
    </>
  );
}

/** A bar a day against the day's target; hatched where some drinks had no volume, so it's at least that much. */
function FluidChart({ days, today, units }: { days: GoalDay[]; today: string; units: UnitSystem }) {
  const hatch = useId();
  const top = Math.max(...days.map((d) => Math.max(d.totals?.fluid.value ?? 0, d.targets.fluidMl)));
  const step = top > 4000 ? 1000 : 500;
  const max = Math.ceil((top * 1.05) / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const slot = (chart.right - chart.left) / days.length;
  const barWidth = slot * 0.62;
  const y = (ml: number) => chart.bottom - (ml / max) * (chart.bottom - chart.top);

  return (
    <>
      <svg className="weigh-trend" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`Fluid over the last ${days.length} days, against the target`}>
        <defs>
          <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: "var(--surface)" }} strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={chart.left} x2={chart.right} y1={y(v)} y2={y(v)} style={{ stroke: "var(--line)" }} />
            <text x={chart.left - 6} y={y(v) + 4} textAnchor="end" className="chart-label">
              {units === "metric" ? v / 1000 : toDisplayFluid(v, units)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const ml = d.totals?.fluid.value ?? 0;
          const x = chart.left + i * slot + (slot - barWidth) / 2;
          return (
            <g key={d.date} opacity={d.date === today ? 0.5 : 1}>
              {ml > 0 && <rect x={x} y={y(ml)} width={barWidth} height={y(0) - y(ml)} style={{ fill: "var(--fluid)" }} />}
              {ml > 0 && !!d.totals?.fluid.missing && <rect x={x} y={y(ml)} width={barWidth} height={y(0) - y(ml)} fill={`url(#${hatch})`} />}
              <text x={chart.left + (i + 0.5) * slot} y={chart.height - 4} textAnchor="middle" className={d.date === today ? "chart-label chart-label-today" : "chart-label"}>
                {dayTick(d.date)}
              </text>
            </g>
          );
        })}
        <path d={stepPath(days.map((d) => d.targets.fluidMl), slot, y)} fill="none" style={{ stroke: "var(--text)" }} strokeWidth="1.5" opacity={0.7} />
      </svg>
      <ul className="chart-legend">
        <li className="legend-fluid">Intake</li>
        <li className="legend-line">Target</li>
      </ul>
    </>
  );
}
