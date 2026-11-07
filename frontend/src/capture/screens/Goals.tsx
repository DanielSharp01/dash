import { useState } from "react";
import { Navigate, useParams } from "react-router";
import {
  ageOn,
  BEGINNING,
  bodyKgAt,
  changeStartsFrom,
  dailyTargets,
  type DailyTargets,
  type Entry,
  fluidUnit,
  formatFluid,
  formatWeight,
  fromDisplayFluid,
  fromDisplayWeight,
  macroPresets,
  type MacroPreset,
  metabolismPresets,
  MIN_KCAL,
  type Plan,
  type PlanAreas,
  planAt,
  samePlan,
  shiftDate,
  splitPlanVersions,
  toDisplayFluid,
  toDisplayWeight,
  type UnitSystem,
  weightUnit,
} from "@dash/core";
import { useEntriesBetween } from "../../queries/entries.queries";
import { savePlan, useMe } from "../../queries/me.queries";
import { useWeighIns } from "../../queries/weighIns.queries";
import { ADULT_AGE, targetDate } from "../body";
import { dayMs, todayKey } from "../time";
import { DateChip, tapCard } from "../ui/DateChip";
import { FlowShell } from "../ui/FlowShell";
import { MissingDetails } from "../ui/MissingDetails";
import { NumberInput } from "../ui/NumberInput";
import { useOpen, useSteps } from "../ui/useSteps";
import { BmiBadge, WeightSection } from "./Weight";

type GoalArea = "goal" | "metabolism" | "macros" | "fluid";

const areas: Record<GoalArea, { title: string; icon: string }> = {
  goal: { title: "Goal", icon: "🎯" },
  metabolism: { title: "Metabolism", icon: "🔥" },
  macros: { title: "Macros", icon: "🥗" },
  fluid: { title: "Fluid", icon: "💧" },
};

const DAY = 86_400_000;
const fmt = (n: number) => Math.round(n).toLocaleString();

export function GoalsScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"goal">("goal");
  const open = useOpen();
  const { profile, plan: history } = useMe();
  const { units } = profile;
  const plan = planAt(history);
  const t = dailyTargets(profile, history, useWeighIns());
  const changes = planChanges(history, units);
  const summaries = {
    macros: `${macroPresets[plan.macroPlan.preset].label} · P ${t.protein} g · C ${t.carbs} g · F ${t.fat} g`,
    fluid: `${formatFluid(plan.fluidGoalMl, units)} a day`,
  };

  return (
    <FlowShell title="Goal" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <WeightSection />

      <ul className="list">
        {(["macros", "fluid"] as const).map((area) => (
          <li key={area}>
            <button className="row" onClick={() => open(`/goal/${area}`)}>
              <span className="row-icon">{areas[area].icon}</span>
              <span className="row-main">
                <span className="row-title">{areas[area].title}</span>
                <span className="row-sub">{summaries[area]}</span>
              </span>
              <span className="row-chevron">›</span>
            </button>
          </li>
        ))}
      </ul>

      {changes.length > 1 && (
        <details className="version-history">
          <summary>History · {changes.length} changes</summary>
          <ul>
            {changes.map(([from, parts]) => (
              <li key={from}>
                <span>
                  <b>{from !== BEGINNING ? `Since ${new Date(`${from}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "Before"}</b>
                  {parts.join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </FlowShell>
  );
}

/** The daily budget worked out as a sum, top to bottom; it explains the goal, so it lives on the goal page. */
function Budget({ t, plan, units }: { t: DailyTargets; plan: Plan; units: UnitSystem }) {
  return (
    <section className="budget">
      {t.missing.length > 0 && <MissingDetails missing={t.missing} lead="Using a placeholder until Dash knows your" />}
      <dl className="goal-math">
        {t.calc && (
          <>
            <div>
              <dt>Resting burn</dt>
              <dd>{fmt(t.calc.bmr)}</dd>
            </div>
            <div className="math-burn">
              <dt>
                × {plan.metabolismMultiplier} metabolism
                {plan.calibratedFrom && <small>from holding weight on {fmt(plan.calibratedFrom.maintenanceKcal)} kcal</small>}
              </dt>
              <dd>{fmt(t.calc.maintenance)}</dd>
            </div>
            {t.calc.deficit > 0 && (
              <div className="math-deficit">
                <dt>− losing {formatWeight(plan.goal.kgPerWeek, units)} a week</dt>
                <dd>−{fmt(t.calc.deficit)}</dd>
              </div>
            )}
            {t.calc.clamped && (
              <div className="math-floor">
                <dt>Kept at the {fmt(MIN_KCAL)} kcal minimum</dt>
                <dd>↑</dd>
              </div>
            )}
          </>
        )}
        <div className="math-total">
          <dt>Your daily budget</dt>
          <dd>{fmt(t.kcal)} kcal</dd>
        </div>
      </dl>
      <p className="budget-exercise">+ whatever you burn in logged exercise</p>
    </section>
  );
}

const isArea = (area: string | undefined): area is GoalArea => area !== undefined && Object.hasOwn(areas, area);

export function GoalAreaRoute() {
  const { area } = useParams();
  if (!isArea(area)) return <Navigate to="/goal" replace />;
  return <SetGoalArea key={area} area={area} />;
}

/** One area's values as a draft, so trying options doesn't create a version per tap. */
function SetGoalArea({ area }: { area: GoalArea }) {
  const { close } = useSteps<"set">("set", undefined, "/goal");
  const { profile, plan: history } = useMe();
  const { units } = profile;
  const current = planAt(history);
  const [draft, setDraft] = useState<Plan>(current);
  const update = (patch: Partial<Plan>) => setDraft((d) => ({ ...d, ...patch }));
  const weighIns = useWeighIns();
  const t = dailyTargets(profile, splitPlanVersions([{ from: BEGINNING, plan: draft }]), weighIns);
  const [from, setFrom] = useState(todayKey);
  const since = changeStartsFrom(history, draft);
  const fromValid = !!from && from >= since;
  const save = (change: "fix" | { from: string }) => {
    void savePlan(draft, change);
    close();
  };

  return (
    <FlowShell title={areas[area].title} canGoBack onBack={close} onClose={close}>
      {area === "goal" && <GoalFields draft={draft} update={update} units={units} body={bodyKgAt(weighIns)} heightCm={profile.heightCm} adult={!profile.birthday || ageOn(profile.birthday) >= ADULT_AGE} />}
      {area === "goal" && (
        <>
          <h2 className="list-heading budget-heading">How your budget is worked out</h2>
          <Budget t={t} plan={draft} units={units} />
        </>
      )}
      {area === "metabolism" && <MetabolismFields draft={draft} update={update} bmr={t.calc?.bmr} />}
      {area === "macros" && <MacroFields draft={draft} update={update} t={t} />}
      {area === "fluid" && <FluidFields draft={draft} update={update} units={units} />}

      {!samePlan(draft, current) && (
        <div className="field">
          <span className="field-label">Save</span>
          <button className="row row-choice" onClick={() => save("fix")}>
            <span className="row-main">
              <span className="row-title">Correct the current one</span>
              <span className="row-sub">Past days follow</span>
            </span>
          </button>
          <div className="row row-choice" {...tapCard(() => save({ from }), !fromValid)}>
            <span className="row-main">
              <span className="row-title">Start a new one</span>
              <span className="row-sub">{fromValid ? "Earlier days keep the old one" : "Pick a day on or after the current one started"}</span>
              <DateChip prefix="From" value={from} min={since === BEGINNING ? undefined : since} max={todayKey()} onChange={setFrom} />
            </span>
          </div>
        </div>
      )}
    </FlowShell>
  );
}

type FieldsProps = { draft: Plan; update: (patch: Partial<Plan>) => void };

/** Metric pace in kg a week; imperial in lb. A drag lands on a snap point within this distance of it. */
const paceScale: Record<UnitSystem, { max: number; step: number; snaps: number[]; pull: number }> = {
  metric: { max: 1, step: 0.01, snaps: [0, 0.25, 0.5, 0.75, 1], pull: 0.03 },
  imperial: { max: 2, step: 0.02, snaps: [0, 0.5, 1, 1.5, 2], pull: 0.06 },
};

/** A starting target: a BMI of 25 when that's below you, else 5 kg off. */
function suggestedTarget(currentKg: number, heightCm: number | undefined) {
  const healthy = heightCm ? 25 * (heightCm / 100) ** 2 : undefined;
  return Math.round((healthy && healthy < currentKg ? healthy : currentKg - 5) * 2) / 2;
}

type GoalFieldsProps = FieldsProps & { units: UnitSystem; body: { kg: number; known: boolean }; heightCm: number | undefined; adult: boolean };

function GoalFields({ draft, update, units, body, heightCm, adult }: GoalFieldsProps) {
  const goal = draft.goal;
  const losing = goal.kgPerWeek > 0;
  const scale = paceScale[units];
  const pace = toDisplayWeight(goal.kgPerWeek, units);
  const setPace = (value: number) => {
    const snapped = scale.snaps.find((s) => Math.abs(s - value) <= scale.pull) ?? value;
    update({ goal: { ...goal, kgPerWeek: fromDisplayWeight(snapped, units) } });
  };
  const now = toDisplayWeight(body.kg, units);
  const lowest = heightCm ? toDisplayWeight(18.5 * (heightCm / 100) ** 2, units) : now - (units === "metric" ? 30 : 66);
  const range = { min: Math.floor(Math.min(lowest, now - 10) * 2) / 2, max: Math.floor(now * 2) / 2 };
  const target = goal.targetKg;

  return (
    <>
      <GoalHeadline goal={goal} body={body} units={units} />

      {losing && (
        <div className="field">
          <div className="slider-head">
            <h2 className="list-heading">Target weight</h2>
            {target !== undefined && (
              <label className="slider-value">
                <NumberInput aria-label="Target weight" value={toDisplayWeight(target, units)} onChange={(n) => n !== undefined && n > 0 && update({ goal: { ...goal, targetKg: fromDisplayWeight(n, units) } })} />
                {weightUnit(units)}
              </label>
            )}
          </div>
          {target === undefined ? (
            <button className="btn btn-block" onClick={() => update({ goal: { ...goal, targetKg: suggestedTarget(body.kg, heightCm) } })}>
              Add a target
            </button>
          ) : (
            <>
              <input
                className="slider"
                type="range"
                aria-label="Target weight"
                min={range.min}
                max={range.max}
                step={0.5}
                value={Math.min(Math.max(toDisplayWeight(target, units), range.min), range.max)}
                onChange={(e) => update({ goal: { ...goal, targetKg: fromDisplayWeight(Number(e.target.value), units) } })}
              />
              <div className="slider-ends">
                <span>{range.min} {weightUnit(units)}</span>
                <span>{body.known ? `${now} ${weightUnit(units)} now` : ""}</span>
              </div>
              <div className="slider-foot">
                {heightCm && <BmiBadge bmi={target / (heightCm / 100) ** 2} withBand={adult} />}
                <button className="link-btn" onClick={() => update({ goal: { kgPerWeek: goal.kgPerWeek } })}>
                  Remove target
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="field">
        <div className="slider-head">
          <h2 className="list-heading">Pace</h2>
          <b>{losing ? `−${formatWeight(goal.kgPerWeek, units)} a week` : "Hold"}</b>
        </div>
        <input className="slider" type="range" aria-label="Pace per week" min={0} max={scale.max} step={scale.step} value={Math.min(pace, scale.max)} onChange={(e) => setPace(Number(e.target.value))} />
        <div className="slider-ticks">
          {scale.snaps.map((s) => (
            <button key={s} style={{ left: `${(s / scale.max) * 100}%` }} onClick={() => setPace(s)}>
              {s === 0 ? "Hold" : s}
            </button>
          ))}
        </div>
        <p className="hint">
          {body.known && goal.kgPerWeek > body.kg * 0.01
            ? "That's more than 1% of your body weight a week, faster than most guidance suggests."
            : "Slower is easier to keep up; most guidance tops out around 1% of body weight a week."}
        </p>
      </div>
    </>
  );
}

/** What the goal comes to: when you'd reach the target, or what the pace means without one. */
function GoalHeadline({ goal, body, units }: { goal: Plan["goal"]; body: { kg: number; known: boolean }; units: UnitSystem }) {
  const [lead, big, sub] = ((): [string, string, string] => {
    if (goal.kgPerWeek <= 0) return ["Holding your weight", body.known ? formatWeight(body.kg, units) : "Hold", "Your budget keeps it steady"];
    const pace = `−${formatWeight(goal.kgPerWeek, units)} a week`;
    if (goal.targetKg === undefined) return ["Losing", pace, "No end date; add a target to see when you'd get there"];
    if (!body.known) return [`Aiming for ${formatWeight(goal.targetKg, units)}`, pace, "Weigh in to see when you'd get there"];
    if (goal.targetKg >= body.kg) return [`Aiming for ${formatWeight(goal.targetKg, units)}`, "Already there", "Pick a target below your current weight"];
    const weeks = (body.kg - goal.targetKg) / goal.kgPerWeek;
    const finish = targetDate(body.kg, goal)!;
    const time = weeks < 9 ? `${Math.max(1, Math.round(weeks))} weeks` : `${Math.round(weeks / 4.345)} months`;
    return [`You'd reach ${formatWeight(goal.targetKg, units)}`, finish.toLocaleDateString(undefined, { month: "long", year: "numeric" }), `in about ${time} · ${formatWeight(body.kg - goal.targetKg, units)} to go`];
  })();
  return (
    <section className="goal-headline">
      <span>{lead}</span>
      <strong>{big}</strong>
      <span>{sub}</span>
    </section>
  );
}

function MetabolismFields({ draft, update, bmr }: FieldsProps & { bmr: number | undefined }) {
  return (
    <div className="field">
      <p className="hint">
        Resting burn × this multiplier is what you burn on a day without logged exercise. It covers everything Dash doesn't log, like walking around and your
        build. Logged exercise is added on top.
      </p>
      <KnownMaintenance bmr={bmr} onUse={(metabolismMultiplier, calibratedFrom) => update({ metabolismMultiplier, calibratedFrom })} />
      {draft.calibratedFrom && (
        <p className="calibrated">
          × {draft.metabolismMultiplier}, from holding weight on {draft.calibratedFrom.maintenanceKcal.toLocaleString()} kcal
          {draft.calibratedFrom.loggedExerciseKcal > 0 && ` minus ${draft.calibratedFrom.loggedExerciseKcal} kcal of logged exercise a day`}.
        </p>
      )}
      <span className="field-label sub-label">Or start from your day</span>
      <div className="multiplier-presets">
        {metabolismPresets.map((m) => (
          <button
            key={m.value}
            className="tile"
            aria-pressed={!draft.calibratedFrom && draft.metabolismMultiplier === m.value}
            onClick={() => update({ metabolismMultiplier: m.value, calibratedFrom: undefined })}
          >
            <strong>× {m.value}</strong>
            <small>{m.label}</small>
          </button>
        ))}
      </div>
      <label className="measure-def multiplier-custom">
        Or exactly ×
        <NumberInput
          aria-label="Multiplier"
          value={draft.metabolismMultiplier}
          onChange={(n) => n !== undefined && n >= 1 && n <= 2.5 && update({ metabolismMultiplier: n, calibratedFrom: undefined })}
        />
      </label>
    </div>
  );
}

/** Average logged exercise burn per day over the last four weeks, or since logging started if that's sooner. */
function loggedExercisePerDay(entries: Entry[], from: string) {
  const today = todayKey();
  const first = entries.reduce((min, e) => (e.when.date < min ? e.when.date : min), today);
  const start = first > from ? first : from;
  const days = Math.round((dayMs(today) - dayMs(start)) / DAY) + 1;
  const total = entries.filter((e) => e.kind === "exercise" && e.when.date >= start && e.when.date <= today).reduce((sum, e) => sum + (e.kind === "exercise" ? (e.kcal ?? 0) : 0), 0);
  return Math.round(total / days);
}

/**
 * People who already know what they hold weight on shouldn't have to guess a multiplier. Their
 * usual workouts are part of that intake, so the logged average comes off before dividing.
 */
function KnownMaintenance({ bmr, onUse }: { bmr: number | undefined; onUse: (multiplier: number, calibratedFrom: NonNullable<Plan["calibratedFrom"]>) => void }) {
  const today = todayKey();
  const from = shiftDate(today, -27);
  const logged = loggedExercisePerDay(useEntriesBetween(from, today).data ?? [], from);
  const [kcal, setKcal] = useState("");
  const [includesWorkouts, setIncludesWorkouts] = useState(true);
  const n = Number(kcal);
  const subtract = includesWorkouts ? logged : 0;
  const multiplier = bmr && n > 0 ? Math.round(((n - subtract) / bmr) * 100) / 100 : undefined;
  const sensible = multiplier !== undefined && multiplier >= 1 && multiplier <= 2.5;

  return (
    <div className="known-maintenance">
      <label className="measure-def">
        I hold my weight on about
        <input inputMode="numeric" placeholder="?" value={kcal} disabled={!bmr} onChange={(e) => setKcal(e.target.value)} />
        kcal
      </label>
      {!bmr && <p className="hint">Needs your weight, height and age first.</p>}
      {bmr && n > 0 && logged > 0 && (
        <label className="check-line">
          <input type="checkbox" checked={includesWorkouts} onChange={(e) => setIncludesWorkouts(e.target.checked)} />
          That includes my workouts (you've logged about {logged} kcal a day of exercise lately)
        </label>
      )}
      {multiplier !== undefined && (
        <p className="hint">
          {sensible ? (
            <>
              {subtract > 0 ? `${n.toLocaleString()} − ${subtract} logged exercise` : n.toLocaleString()} ÷ {Math.round(bmr!).toLocaleString()} resting burn = × {multiplier}.{" "}
              <button
                className="link"
                onClick={() => {
                  onUse(multiplier, { maintenanceKcal: n, loggedExerciseKcal: subtract });
                  setKcal("");
                }}
              >
                Use × {multiplier}
              </button>
            </>
          ) : (
            `That's × ${multiplier} on your resting burn, outside the 1–2.5 range the formula holds for.`
          )}
        </p>
      )}
    </div>
  );
}

function MacroFields({ draft, update, t }: FieldsProps & { t: DailyTargets }) {
  return (
    <div className="field">
      <span className="field-label">Daily macros</span>
      <div className="chip-row" role="radiogroup" aria-label="Macro split">
        {(Object.keys(macroPresets) as MacroPreset[]).map((key) => (
          <button key={key} role="radio" aria-checked={draft.macroPlan.preset === key} className="chip" onClick={() => update({ macroPlan: macroPresets[key].plan })}>
            {macroPresets[key].label}
          </button>
        ))}
      </div>
      <p className="goal-macros">
        <span className="macro-protein">Protein {t.protein} g</span> · <span className="macro-carbs">Carbs {t.carbs} g</span> ·{" "}
        <span className="macro-fat">Fat {t.fat} g</span>
      </p>
      <p className="hint">{describeMacros(draft.macroPlan)}</p>
    </div>
  );
}

function FluidFields({ draft, update, units }: FieldsProps & { units: UnitSystem }) {
  return (
    <div className="field">
      <span className="field-label">Daily fluid</span>
      <label className="kcal-field">
        <NumberInput key={units} integer value={toDisplayFluid(draft.fluidGoalMl, units)} onChange={(n) => n && n > 0 && update({ fluidGoalMl: fromDisplayFluid(n, units) })} />
        <span>{fluidUnit(units)}</span>
      </label>
      <p className="hint">Drinks measured in ml count toward it. About 2 L a day is a common target; food covers some water too.</p>
    </div>
  );
}

function describeMacros(m: Plan["macroPlan"]) {
  const split = m.carbPct !== undefined ? `carbs at ${Math.round(m.carbPct * 100)}% of calories, fat the rest` : `fat at ${Math.round((m.fatPct ?? 0.3) * 100)}% of calories, carbs the rest`;
  return `Protein at ${m.proteinPerKg} g per kg of a healthy-range weight, ${split}.`;
}

/** Newest first; each start date lists only the areas that changed on it. */
function planChanges(h: PlanAreas, units: UnitSystem) {
  const byFrom = new Map<string, string[]>();
  const add = (from: string, part: string) => byFrom.set(from, [...(byFrom.get(from) ?? []), part]);
  for (const v of h.goal) add(v.from, v.value.goal.kgPerWeek > 0 ? `−${formatWeight(v.value.goal.kgPerWeek, units)}/week` : "Maintain");
  for (const v of h.macros) add(v.from, macroPresets[v.value.macroPlan.preset].label);
  for (const v of h.metabolism) add(v.from, `× ${v.value.metabolismMultiplier}`);
  for (const v of h.fluid) add(v.from, `💧 ${formatFluid(v.value.fluidGoalMl, units)}`);
  return [...byFrom].sort(([a], [b]) => b.localeCompare(a));
}
