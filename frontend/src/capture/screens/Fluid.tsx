import { useId } from "react";
import { formatFluid, toDisplayFluid, type UnitSystem } from "@dash/core";
import { useProfile } from "../../queries/me.queries";
import { useOpen } from "../ui/useSteps";
import { averageOf, type Bucket, bucketLabels, chartFrame, type Grouping, stepPath, useLastWeek } from "./goalDays";

/** Fluid on Goals: the daily target, how the week went, today so far, and a bar per day. */
export function FluidSection() {
  const open = useOpen();
  const { units } = useProfile();
  const { days, today, buckets } = useLastWeek();
  const now = days.at(-1)!;
  // Today isn't over, so the average only counts finished days with something logged.
  const finished = days.filter((d) => d.date < today && d.totals);
  const average = finished.length ? averageOf(finished, (d) => d.totals!.fluid.value) : undefined;
  const sofar = now.totals?.fluid;
  const openChart = () => open("/goal/chart/fluid");

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
          <button className="chip" onClick={openChart}>
            Full chart
          </button>
        </div>
        <FluidChart buckets={buckets} by="day" units={units} onOpen={openChart} />
      </section>
    </>
  );
}

/**
 * A bar a day or week (a week's is its daily average) against the target; hatched where some drinks
 * had no volume, so it's at least that much.
 */
export function FluidChart({ buckets, by, units, tall, onOpen }: { buckets: Bucket[]; by: Grouping; units: UnitSystem; tall?: boolean; onOpen?: () => void }) {
  const hatch = useId();
  const chart = chartFrame(tall);
  const bars = buckets.map((b) => ({
    b,
    ml: averageOf(b.counted, (d) => d.totals!.fluid.value),
    missing: b.counted.some((d) => d.totals!.fluid.missing > 0),
    target: averageOf(b.counted.length ? b.counted : b.days, (d) => d.targets.fluidMl),
  }));
  const top = Math.max(...bars.map((bar) => Math.max(bar.ml, bar.target)));
  const step = top > 4000 ? 1000 : 500;
  const max = Math.ceil((top * 1.05) / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const slot = (chart.right - chart.left) / buckets.length;
  const barWidth = Math.max(slot * 0.62, 1);
  const y = (ml: number) => chart.bottom - (ml / max) * (chart.bottom - chart.top);
  const labels = bucketLabels(buckets, by, slot);

  return (
    <>
      <svg
        className={onOpen ? "weigh-trend chart-tap" : "weigh-trend"}
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        role="img"
        aria-label={`Fluid per ${by}, against the target`}
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
              {units === "metric" ? v / 1000 : toDisplayFluid(v, units)}
            </text>
          </g>
        ))}
        {bars.map(({ b, ml, missing }, i) => {
          const x = chart.left + i * slot + (slot - barWidth) / 2;
          return (
            <g key={b.from} opacity={b.hasToday ? 0.5 : 1}>
              {ml > 0 && <rect x={x} y={y(ml)} width={barWidth} height={y(0) - y(ml)} style={{ fill: "var(--fluid)" }} />}
              {ml > 0 && missing && <rect x={x} y={y(ml)} width={barWidth} height={y(0) - y(ml)} fill={`url(#${hatch})`} />}
              {labels[i] && (
                <text x={labels[i].x} y={chart.height - 4} textAnchor={labels[i].anchor} className={b.hasToday && by === "day" ? "chart-label chart-label-today" : "chart-label"}>
                  {labels[i].text}
                </text>
              )}
            </g>
          );
        })}
        <path d={stepPath(bars.map((bar) => bar.target), slot, y)} fill="none" style={{ stroke: "var(--text)" }} strokeWidth="1.5" opacity={0.7} />
      </svg>
      <ul className="chart-legend">
        <li className="legend-fluid">Intake</li>
        <li className="legend-line">Target</li>
      </ul>
    </>
  );
}
