import { useState } from "react";
import { ageOn, dayTotals, daysBetween, formatWeighIn, formatWeight, loggedWeight, metabolismPresets, type Plan, planAt, type PlanAreas, plannedWeight, projectedWeight, shiftDate, type WeighIn, weeklyTrend, weeksBetween } from "@dash/core";
import { useEntriesBetween } from "../../queries/entries.queries";
import { useFoodLookup } from "../../queries/foods.queries";
import { useMe } from "../../queries/me.queries";
import { addWeighIn, removeWeighIn, useWeighIns } from "../../queries/weighIns.queries";
import { ADULT_AGE, targetDate } from "../body";
import { dayMs, todayKey } from "../time";
import { WeightInput } from "../ui/BodyInputs";
import { DateChip } from "../ui/DateChip";
import { FlowShell } from "../ui/FlowShell";
import { notify } from "../ui/notify";
import { useOpen, useSteps } from "../ui/useSteps";
import { chartFrame, type ChartSize, type Grouping } from "./goalDays";

const DAY = 86_400_000;
/** The overview's window; the full chart offers others. */
const CHART_DAYS = 90;

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const signed = (kg: number) => `${kg > 0 ? "+" : kg < 0 ? "−" : "±"}${Math.abs(kg).toFixed(2)} kg`;

/** The top of Goals: the latest weigh-in, what the plan says, the ways to change it, and the chart. */
export function WeightSection() {
  const open = useOpen();
  const { profile, plan: history } = useMe();
  const { heightCm, birthday } = profile;
  const all = useWeighIns();
  const latest = all.at(-1);
  const change = trendChange(all);
  const bmi = latest && heightCm ? latest.kg / (heightCm / 100) ** 2 : undefined;
  const today = todayKey();
  const plan = planAt(history);
  const range = chartRange(all, today);
  const logged = useLoggedWeight(all, range.from, today);
  const openChart = () => open("/progress/chart/weight");
  const { goal } = plan;
  const losing = goal.kgPerWeek > 0;
  const finish = latest && targetDate(latest.kg, goal);
  const preset = metabolismPresets.find((m) => m.value === plan.metabolismMultiplier);
  const goalSet = history.chosen.includes("goal");
  const metabolismSet = history.chosen.includes("metabolism");
  const pace = losing ? `−${formatWeight(goal.kgPerWeek)}` : "Hold";

  return (
    <>
      <h2 className="list-heading">Weight trend</h2>
      <section className="weigh-latest">
        {latest ? (
          <>
            <div className="weigh-now">
              <div className="weigh-big">
                <strong>{latest.kg.toFixed(2)}</strong>
                <span>kg</span>
              </div>
              <span className="weigh-when">{latest.date === today ? "Today" : shortDate(latest.date)}</span>
            </div>
            <div className="weigh-meta">
              {change && (
                <span>
                  <b className="weigh-change">{signed(change.delta)}</b> <span className="nowrap">{change.label}</span>
                </span>
              )}
            </div>
            {bmi && <BmiBadge bmi={bmi} withBand={!birthday || ageOn(birthday) >= ADULT_AGE} />}
          </>
        ) : (
          <div className="weigh-now">
            <div className="weigh-big">
              <strong>—</strong>
              <span>kg</span>
            </div>
            <span className="weigh-when">No weigh-ins yet</span>
          </div>
        )}
        {/* An area a new account hasn't set shows what the budget uses meanwhile, so the numbers on Today still make sense. */}
        <dl className="stat-row">
          <div>
            <dt>Pace</dt>
            <dd className={goalSet ? undefined : "stat-unset"}>{goalSet ? pace : "Not set"}</dd>
            <dd className="stat-sub">{goalSet ? (losing ? "a week" : "maintain") : `using ${pace}`}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd className={goalSet ? undefined : "stat-unset"}>{!goalSet ? "Not set" : losing && goal.targetKg !== undefined ? formatWeight(goal.targetKg) : "—"}</dd>
            <dd className="stat-sub">{goalSet && losing && finish ? `by ${finish.toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : " "}</dd>
          </div>
          <div>
            <dt>Metabolism</dt>
            <dd className={metabolismSet ? undefined : "stat-unset"}>{metabolismSet ? `× ${plan.metabolismMultiplier}` : "Not set"}</dd>
            <dd className="stat-sub">
              {!metabolismSet ? `using × ${plan.metabolismMultiplier}` : plan.calibratedFrom ? `from ${plan.calibratedFrom.maintenanceKcal.toLocaleString()} kcal` : (preset?.label ?? "custom")}
            </dd>
          </div>
        </dl>
        <div className="card-actions">
          <button className="chip" onClick={() => open("/progress/goal")}>
            Edit goal
          </button>
          <button className="chip" onClick={() => open("/progress/metabolism")}>
            Metabolism
          </button>
          <button className="chip" onClick={() => open("/progress/weigh-ins")}>
            History
          </button>
          <button className="chip" onClick={openChart}>
            Full chart
          </button>
          <button className="chip primary" onClick={() => open("/progress/weigh-in")}>
            Weigh in
          </button>
        </div>
        {all.length > 0 && <WeightChart weighIns={all} history={history} today={today} logged={logged} by="day" onOpen={openChart} {...range} />}
      </section>
    </>
  );
}

/** What logged eating says the weight did since the first weigh-in in view, up to this morning. */
export function useLoggedWeight(all: WeighIn[], from: string, today: string) {
  const { profile, plan } = useMe();
  const foods = useFoodLookup();
  const start = all.find((w) => w.date >= from && w.date <= today);
  const entries = useEntriesBetween(start?.date ?? today, shiftDate(today, -1)).data;
  if (!start || !entries || start.date >= today) return undefined;
  const days = Array.from({ length: Math.round((dayMs(today) - dayMs(start.date)) / DAY) }, (_, i) => {
    const date = shiftDate(start.date, i);
    const ofDay = entries.filter((e) => e.when.date === date);
    const totals = dayTotals(ofDay, foods);
    return { date, eaten: ofDay.some((e) => e.kind === "food") ? totals.kcal.value : undefined, burned: totals.burned };
  });
  return loggedWeight(profile, plan, start, days);
}

const bmiBands = [
  { below: 18.5, label: "Underweight", tone: "under" },
  { below: 25, label: "Healthy", tone: "healthy" },
  { below: 30, label: "Overweight", tone: "over" },
  { below: 35, label: "Obese class I", tone: "obese" },
  { below: 40, label: "Obese class II", tone: "obese" },
  { below: Infinity, label: "Obese class III", tone: "obese" },
] as const;

/** WHO adult bands. The label travels with the colour so it never carries meaning alone. */
export function BmiBadge({ bmi, withBand }: { bmi: number; withBand: boolean }) {
  const value = (Math.round(bmi * 10) / 10).toFixed(1);
  if (!withBand) return <span className="bmi badge-muted">BMI {value}</span>;
  const band = bmiBands.find((b) => bmi < b.below)!;
  return (
    <span className={`bmi bmi-${band.tone}`}>
      BMI {value} · {band.label}
    </span>
  );
}

/** The card summarises a stretch of time; the per-weigh-in changes live in the history. */
function trendChange(all: WeighIn[]) {
  const latest = all.at(-1);
  if (!latest || all.length < 2) return undefined;
  const cutoff = dayMs(latest.date) - 30 * DAY;
  const ref = [...all].reverse().find((w) => dayMs(w.date) <= cutoff) ?? all[0]!;
  if (ref === latest) return undefined;
  const label = dayMs(ref.date) <= cutoff ? "in 30 days" : `since ${shortDate(ref.date)}`;
  return { delta: latest.kg - ref.kg, label };
}

/**
 * Up to the last 90 days, no wider than the weigh-ins in it need. With less than two weeks of them,
 * the chart starts at the first and runs two weeks on, so the planned line shows where it's heading.
 */
function chartRange(all: WeighIn[], today: string) {
  const longest = shiftDate(today, -CHART_DAYS);
  const first = all.find((w) => w.date >= longest)?.date ?? longest;
  return first < shiftDate(today, -14) ? { from: first, to: today } : { from: first, to: shiftDate(first, 14) };
}

/**
 * Weigh-ins as dots on a line (or each week's average), each settings stretch's planned pace dashed
 * behind them, and the weight logged eating implies.
 */
export function WeightChart({
  weighIns,
  history,
  from,
  to,
  today,
  logged,
  by,
  size,
  onOpen,
}: {
  weighIns: WeighIn[];
  history: PlanAreas;
  from: string;
  to: string;
  today: string;
  logged: { date: string; kg: number }[] | undefined;
  by: Grouping;
  size?: ChartSize;
  onOpen?: () => void;
}) {
  const plot = chartFrame(size);
  const inView = weighIns.filter((w) => w.date >= from && w.date <= to);
  if (!inView.length) return <p className="hint weight-empty">No weigh-ins from {shortDate(from)} to {shortDate(to)}.</p>;
  const points = by === "day" ? inView : weeklyAverages(inView, from, to);
  // Past today, the pace carried on from the latest weigh-in lands on the target when Goals says it will.
  const latest = to > today ? weighIns.findLast((w) => w.date <= today) : undefined;
  const planned = latest && latest.date <= from ? [] : plannedWeight(history, weighIns, from, latest?.date ?? to);
  const projected = latest && projectedWeight(latest.date < from ? { date: from, kg: latest.kg } : latest, planAt(history).goal, to);
  const shown = [...points, ...planned.flat(), ...(projected ?? []), ...(logged ?? [])].map((p) => p.kg);
  const lo = Math.floor(Math.min(...shown) - 0.3);
  const hi = Math.ceil(Math.max(...shown) + 0.3);
  const step = hi - lo > 6 ? 2 : 1;
  const yTicks = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const t0 = dayMs(from);
  const span = dayMs(to) - t0;
  const x = (date: string) => plot.left + ((dayMs(date) - t0) / span) * (plot.right - plot.left);
  const y = (kg: number) => plot.bottom - ((kg - lo) / (hi - lo)) * (plot.bottom - plot.top);
  // Weeks read better than one or two month names on a short window.
  const dateTicks = span / DAY <= 45 ? weekTicks(from, to) : monthStarts(from, to);
  const last = points.at(-1)!;

  return (
    <>
      <svg
        className={onOpen ? "weigh-trend chart-tap" : "weigh-trend"}
        viewBox={`0 0 ${plot.width} ${plot.height}`}
        role="img"
        aria-label={`Weight${by === "week" ? " by weekly average" : ""} from ${shortDate(from)}, with the planned pace dashed and the weight logged eating implies`}
        onClick={onOpen}
      >
        {yTicks.map((v) => {
          const ty = plot.bottom - ((v - lo) / (hi - lo)) * (plot.bottom - plot.top);
          return (
            <g key={v}>
              <line x1={plot.left} x2={plot.right} y1={ty} y2={ty} style={{ stroke: "var(--line)" }} />
              <text x={plot.left - 6} y={ty + 4} textAnchor="end" className="chart-label">
                {v}
              </text>
            </g>
          );
        })}
        {dateTicks.map((d) => (
          <text key={d} x={x(d)} y={plot.height - 4} textAnchor={d === to ? "end" : "middle"} className="chart-label">
            {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, span / DAY <= 45 ? { day: "numeric", month: "short" } : { month: "short" })}
          </text>
        ))}
        {planned.map((line) => (
          <polyline
            key={line[0]!.date}
            points={line.map((p) => `${x(p.date)},${y(p.kg)}`).join(" ")}
            fill="none"
            style={{ stroke: "var(--muted)" }}
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        ))}
        {projected && (
          <polyline
            points={projected.map((p) => `${x(p.date)},${y(p.kg)}`).join(" ")}
            fill="none"
            style={{ stroke: "var(--accent)" }}
            strokeWidth="2"
            strokeDasharray="0.5 4"
            strokeLinecap="round"
          />
        )}
        {to > today && (
          <g>
            <line x1={x(today)} x2={x(today)} y1={plot.top} y2={plot.bottom} style={{ stroke: "var(--line)" }} strokeDasharray="2 3" />
            <text x={x(today) + 4} y={plot.top + 10} className="chart-label">
              today
            </text>
          </g>
        )}
        {logged && <polyline points={logged.map((p) => `${x(p.date)},${y(p.kg)}`).join(" ")} fill="none" style={{ stroke: "var(--food)" }} strokeWidth="1.5" strokeLinejoin="round" />}
        <polyline points={points.map((p) => `${x(p.date)},${y(p.kg)}`).join(" ")} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="2" strokeLinejoin="round" />
        {points.map((p) => (
          <circle key={p.id} cx={x(p.date)} cy={y(p.kg)} r={p === last ? 4 : 2.5} style={{ fill: "var(--accent)", stroke: "var(--surface)" }} strokeWidth={p === last ? 2 : 1} />
        ))}
      </svg>
      <ul className="chart-legend">
        <li className="legend-weigh-ins">{by === "week" ? "Weekly average" : "Weigh-ins"}</li>
        {planned.some((line) => line[0]!.date !== line.at(-1)!.date) && <li className="legend-line legend-planned-line">Planned</li>}
        {projected && <li className="legend-line legend-projected-line">Projected</li>}
        {logged && <li className="legend-line legend-logged-line">From logged</li>}
      </ul>
    </>
  );
}

/**
 * The stretch's rates a week: the trend line through the weigh-ins, what logged eating implies, and
 * the plan's pace. Under them, how far weigh-ins scatter around the trend from day to day.
 */
export function WeightStats({ weighIns, logged, goal }: { weighIns: WeighIn[]; logged: { date: string; kg: number }[] | undefined; goal: Plan["goal"] }) {
  const actual = weeklyTrend(weighIns);
  const fromLogged = logged && weeklyTrend(logged);
  return (
    <>
      <dl className="stat-row">
        <div>
          <dt>Actual</dt>
          <dd>{actual ? signed(actual.perWeek) : "—"}</dd>
          <dd className="stat-sub">a week</dd>
        </div>
        <div className="stat-logged">
          <dt>From logged</dt>
          <dd>{fromLogged ? signed(fromLogged.perWeek) : "—"}</dd>
          <dd className="stat-sub">a week</dd>
        </div>
        <div>
          <dt>Planned</dt>
          <dd>{goal.kgPerWeek === 0 ? "Hold" : signed(-goal.kgPerWeek)}</dd>
          <dd className="stat-sub">{goal.kgPerWeek === 0 ? " " : "a week"}</dd>
        </div>
      </dl>
      {actual && (
        <p className="hint stat-note">
          Weigh-ins scatter ± {actual.scatter.toFixed(2)} kg around the trend from day to day.
        </p>
      )}
    </>
  );
}

/** Every seventh day back from `to`, oldest first, leaving room at the left edge for the axis. */
function weekTicks(from: string, to: string) {
  const ticks: string[] = [];
  for (let d = to; d >= shiftDate(from, 3); d = shiftDate(d, -7)) ticks.unshift(d);
  return ticks;
}

/** The first of each month after `from`, up to `to`; every few months over a long stretch. */
function monthStarts(from: string, to: string) {
  const starts: string[] = [];
  for (let d = new Date(`${from.slice(0, 7)}-01T12:00:00`); ; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    if (key > to) break;
    if (key > from) starts.push(key);
  }
  const every = Math.ceil(starts.length / 6);
  return starts.filter((_, i) => (starts.length - 1 - i) % every === 0);
}

/** Each week's weigh-ins as one point: their average weight, at their average day. */
function weeklyAverages(weighIns: WeighIn[], from: string, to: string): WeighIn[] {
  return weeksBetween(from, to).flatMap((week) => {
    const inWeek = weighIns.filter((w) => w.date >= week.from && w.date <= week.to);
    if (!inWeek.length) return [];
    const offset = Math.round(inWeek.reduce((sum, w) => sum + daysBetween(week.from, w.date), 0) / inWeek.length);
    return [{ id: week.from, date: shiftDate(week.from, offset), kg: inWeek.reduce((sum, w) => sum + w.kg, 0) / inWeek.length }];
  });
}

const longDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * Weighing in is quick: the weight, today unless you pick another day. Around it, what you'd want
 * to know as you step off the scale: the weigh-in before, the change since, and what's left.
 */
export function WeighInRoute() {
  const { close } = useSteps<"weigh">("weigh", undefined, "/progress");
  const { plan } = useMe();
  const all = useWeighIns();
  const [kg, setKg] = useState<number>();
  const [date, setDate] = useState(todayKey);
  const replaced = all.find((w) => w.date === date);
  const before = all.findLast((w) => w.date < date);
  const { goal } = planAt(plan);

  const save = () => {
    if (!kg) return;
    const added = { id: crypto.randomUUID(), date, kg };
    void addWeighIn(added);
    notify(`Weighed in ${formatWeighIn(kg)}`, () => {
      void removeWeighIn(added.id);
      // The server dropped the one it replaced, so it comes back as a new weigh-in.
      if (replaced) void addWeighIn({ ...replaced, id: crypto.randomUUID() });
    });
    close();
  };

  return (
    <FlowShell
      title="Weigh in"
      canGoBack
      onBack={close}
      onClose={close}
      footer={
        <button className="btn btn-primary btn-block" disabled={!kg} onClick={save}>
          Save
        </button>
      }
    >
      <form
        className="big-entry"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="big-entry-note">{before ? `Last: ${formatWeighIn(before.kg)} · ${longDate(before.date)}` : "Your first weigh-in"}</p>
        <WeightInput kg={kg} onChange={setKg} autoFocus enterKeyHint="go" />
        <WeighInChange kg={kg} before={before} kgPerWeek={goal.kgPerWeek} />
        <ToTarget kg={kg ?? before?.kg} targetKg={goal.targetKg} kgPerWeek={goal.kgPerWeek} />
        <DateChip prefix="On" value={date} max={todayKey()} onChange={setDate} />
        {replaced && <p className="hint">Replaces the {formatWeighIn(replaced.kg)} already on that day.</p>}
      </form>
    </FlowShell>
  );
}

/** Down reads as good while losing, up while gaining; holding steady has no direction to cheer. */
function WeighInChange({ kg, before, kgPerWeek }: { kg?: number; before?: WeighIn; kgPerWeek: number }) {
  if (kg === undefined || !before) return <p className="weigh-change"> </p>;
  const delta = kg - before.kg;
  const tone = kgPerWeek === 0 || Math.abs(delta) < 0.005 ? "plain" : delta < 0 === kgPerWeek > 0 ? "good" : "warn";
  return <p className={`weigh-change ${tone}`}>{signed(delta)} since then</p>;
}

function ToTarget({ kg, targetKg, kgPerWeek }: { kg?: number; targetKg?: number; kgPerWeek: number }) {
  if (kg === undefined || targetKg === undefined) return null;
  const reached = kgPerWeek >= 0 ? kg <= targetKg : kg >= targetKg;
  if (reached) return <p className="big-entry-note">You've reached your {formatWeight(targetKg)} target</p>;
  return (
    <p className="big-entry-note">
      {Math.abs(kg - targetKg).toFixed(2)} kg to {formatWeight(targetKg)}
    </p>
  );
}

/** For corrections: move a weigh-in to its right day, delete one, or add a missed one. */
export function WeighInHistoryRoute() {
  const { close } = useSteps<"history">("history", undefined, "/progress");
  const open = useOpen();
  const all = useWeighIns();
  const newest = [...all].reverse();

  const move = (w: WeighIn, date: string) => {
    if (date === w.date) return;
    const replaced = all.find((x) => x.date === date);
    const moved = { ...w, id: crypto.randomUUID(), date };
    void removeWeighIn(w.id);
    void addWeighIn(moved);
    notify(replaced ? `Moved to ${shortDate(date)}, replacing ${formatWeighIn(replaced.kg)}` : `Moved to ${shortDate(date)}`, () => {
      void removeWeighIn(moved.id);
      void addWeighIn({ ...w, id: crypto.randomUUID() });
      if (replaced) void addWeighIn({ ...replaced, id: crypto.randomUUID() });
    });
  };

  return (
    <FlowShell title="Weigh-in history" canGoBack onBack={close} onClose={close}>
      <ul className="list">
        <li>
          <button className="row row-create" onClick={() => open("/progress/weigh-in")}>
            <span className="row-icon">＋</span>
            <span className="row-main">
              <span className="row-title">Add a missed day</span>
            </span>
          </button>
        </li>
        {newest.map((w, i) => {
          const before = newest[i + 1];
          return (
            <li key={w.id} className="weigh-row">
              <span className="weigh-date">
                <DateChip prefix="" value={w.date} max={todayKey()} onChange={(date) => move(w, date)} />
              </span>
              <b>{formatWeighIn(w.kg)}</b>
              <span className="weigh-diff">{before ? signed(w.kg - before.kg) : ""}</span>
              <button
                className="icon-btn small"
                aria-label="Delete weigh-in"
                onClick={() => {
                  void removeWeighIn(w.id);
                  notify("Deleted", () => void addWeighIn({ ...w, id: crypto.randomUUID() }));
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      {!newest.length && <p className="hint">No weigh-ins yet.</p>}
    </FlowShell>
  );
}
