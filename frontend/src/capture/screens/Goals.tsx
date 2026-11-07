import { useState } from "react";
import { Navigate, useParams } from "react-router";
import {
  ageOn,
  BEGINNING,
  bodyKgAt,
  changeStartsFrom,
  customMacroPlan,
  dailyTargets,
  type DailyTargets,
  type Entry,
  formatFluid,
  formatWeight,
  macroPresetLabel,
  macroPresets,
  metabolismPresets,
  MIN_KCAL,
  type Plan,
  type PlanAreas,
  planAt,
  samePlan,
  shiftDate,
  splitPlanVersions,
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
import { Sheet } from "../ui/Sheet";
import { useOpen, useSteps } from "../ui/useSteps";
import { FluidSection } from "./Fluid";
import { averageOf, useGoalDays } from "./goalDays";
import { MacrosSection } from "./Macros";
import { useSetupProgress } from "./setupProgress";
import { BmiBadge, WeightSection } from "./Weight";

type GoalArea = "goal" | "metabolism" | "macros" | "fluid";

const areas: Record<GoalArea, { title: string; icon: string }> = {
  goal: { title: "Goal", icon: "🎯" },
  metabolism: { title: "Metabolism", icon: "🔥" },
  macros: { title: "Macros", icon: "🥗" },
  fluid: { title: "Fluid intake", icon: "💧" },
};

const DAY = 86_400_000;
const fmt = (n: number) => Math.round(n).toLocaleString();

export function GoalsScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"goal">("goal");
  const open = useOpen();
  const { plan: history } = useMe();
  const changes = planChanges(history);
  const setup = useSetupProgress();

  return (
    <FlowShell title="Goal" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      {setup.left.length > 0 && (
        <ul className="list setup-card">
          <li>
            <button className="row" onClick={() => open("/goal/setup")}>
              <span className="row-icon">🎯</span>
              <span className="row-main">
                <span className="row-title">Set up your goals</span>
                <span className="row-sub">
                  {setup.done} of {setup.total} done · {setup.done ? "Continue" : "Start"}
                </span>
              </span>
              <span className="row-chevron">›</span>
            </button>
          </li>
        </ul>
      )}
      <WeightSection />
      <MacrosSection />
      <FluidSection />

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

/** The daily budget worked out as a sum, top to bottom; it explains the goal, so it lives with the goal. */
export function Budget({ t, plan }: { t: DailyTargets; plan: Plan }) {
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
                <dt>− losing {formatWeight(plan.goal.kgPerWeek)} a week</dt>
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
  const current = planAt(history);
  const [draft, setDraft] = useState<Plan>(current);
  const update = (patch: Partial<Plan>) => setDraft((d) => ({ ...d, ...patch }));
  const weighIns = useWeighIns();
  const t = dailyTargets(profile, splitPlanVersions([{ from: BEGINNING, plan: draft }]), weighIns);
  const [from, setFrom] = useState(todayKey);
  const since = changeStartsFrom(history, draft);
  const fromValid = !!from && from >= since;
  const [asking, setAsking] = useState(false);
  const changed = !samePlan(draft, current);
  const unset = !history.chosen.includes(area);
  const save = (change: "fix" | { from: string }) => {
    void savePlan(draft, change, [area]);
    close();
  };
  // A new account's default can be kept as it is; with nothing changed there's nothing to correct or date.
  const submit = () => (changed ? setAsking(true) : unset && save("fix"));

  return (
    <FlowShell
      title={areas[area].title}
      canGoBack
      onBack={close}
      onClose={close}
      footer={
        <button className="btn btn-primary btn-block" disabled={!changed && !unset} onClick={submit}>
          Save
        </button>
      }
    >
      {area === "goal" && <GoalFields draft={draft} update={update} body={bodyKgAt(weighIns)} heightCm={profile.heightCm} adult={!profile.birthday || ageOn(profile.birthday) >= ADULT_AGE} />}
      {area === "goal" && (
        <>
          <h2 className="list-heading budget-heading">How your budget is worked out</h2>
          <Budget t={t} plan={draft} />
        </>
      )}
      {area === "metabolism" && <MetabolismFields draft={draft} update={update} bmr={t.calc?.bmr} />}
      {area === "macros" && <MacroFields draft={draft} update={update} t={t} />}
      {area === "fluid" && <FluidFields draft={draft} update={update} onSubmit={submit} />}

      {asking && (
        <Sheet title="Save the change" onClose={() => setAsking(false)}>
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
        </Sheet>
      )}
    </FlowShell>
  );
}

type FieldsProps = { draft: Plan; update: (patch: Partial<Plan>) => void };

/** Pace in kg a week. A drag lands on a snap point within this distance of it. */
const paceScale = { max: 1, step: 0.01, snaps: [0, 0.25, 0.5, 0.75, 1], pull: 0.03 };

/** A starting target: a BMI of 25 when that's below you, else 5 kg off. */
function suggestedTarget(currentKg: number, heightCm: number | undefined) {
  const healthy = heightCm ? 25 * (heightCm / 100) ** 2 : undefined;
  return Math.round((healthy && healthy < currentKg ? healthy : currentKg - 5) * 2) / 2;
}

type GoalFieldsProps = FieldsProps & { body: { kg: number; known: boolean }; heightCm: number | undefined; adult: boolean };

export function GoalFields({ draft, update, body, heightCm, adult }: GoalFieldsProps) {
  const goal = draft.goal;
  const losing = goal.kgPerWeek > 0;
  const scale = paceScale;
  const setPace = (value: number) => {
    const snapped = scale.snaps.find((s) => Math.abs(s - value) <= scale.pull) ?? value;
    update({ goal: { ...goal, kgPerWeek: snapped } });
  };
  const now = Math.round(body.kg * 100) / 100;
  const lowest = heightCm ? 18.5 * (heightCm / 100) ** 2 : now - 30;
  const range = { min: Math.floor(Math.min(lowest, now - 10) * 2) / 2, max: Math.floor(now * 2) / 2 };
  const target = goal.targetKg;

  return (
    <>
      <GoalHeadline goal={goal} body={body} />

      {losing && (
        <div className="field">
          <div className="slider-head">
            <h2 className="list-heading">Target weight</h2>
            {target !== undefined && (
              <label className="slider-value">
                <NumberInput aria-label="Target weight" value={target} onChange={(n) => n !== undefined && n > 0 && update({ goal: { ...goal, targetKg: n } })} />
                kg
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
                value={Math.min(Math.max(target, range.min), range.max)}
                onChange={(e) => update({ goal: { ...goal, targetKg: Number(e.target.value) } })}
              />
              <div className="slider-ends">
                <span>{range.min} kg</span>
                <span>{body.known ? `${now} kg now` : ""}</span>
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
          <b>{losing ? `−${formatWeight(goal.kgPerWeek)} a week` : "Hold"}</b>
        </div>
        <input className="slider" type="range" aria-label="Pace per week" min={0} max={scale.max} step={scale.step} value={Math.min(goal.kgPerWeek, scale.max)} onChange={(e) => setPace(Number(e.target.value))} />
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
function GoalHeadline({ goal, body }: { goal: Plan["goal"]; body: { kg: number; known: boolean } }) {
  const [lead, big, sub] = ((): [string, string, string] => {
    if (goal.kgPerWeek <= 0) return ["Holding your weight", body.known ? formatWeight(body.kg) : "Hold", "Your budget keeps it steady"];
    const pace = `−${formatWeight(goal.kgPerWeek)} a week`;
    if (goal.targetKg === undefined) return ["Losing", pace, "No end date; add a target to see when you'd get there"];
    if (!body.known) return [`Aiming for ${formatWeight(goal.targetKg)}`, pace, "Weigh in to see when you'd get there"];
    if (goal.targetKg >= body.kg) return [`Aiming for ${formatWeight(goal.targetKg)}`, "Already there", "Pick a target below your current weight"];
    const weeks = (body.kg - goal.targetKg) / goal.kgPerWeek;
    const finish = targetDate(body.kg, goal)!;
    const time = weeks < 9 ? `${Math.max(1, Math.round(weeks))} weeks` : `${Math.round(weeks / 4.345)} months`;
    return [`You'd reach ${formatWeight(goal.targetKg)}`, finish.toLocaleDateString(undefined, { month: "long", year: "numeric" }), `in about ${time} · ${formatWeight(body.kg - goal.targetKg)} to go`];
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

type Preset = keyof typeof macroPresets;

/**
 * Presets set the sliders; protein and fat are yours to move, and carbs take what's left of the
 * budget, so the three always add up to it. Protein runs over common guidance, 0.8 to 2.5 g per kg;
 * fat from 15% of calories to where carbs would run out.
 */
export function MacroFields({ draft, update, t }: FieldsProps & { t: DailyTargets }) {
  const preset = draft.macroPlan.preset;
  const chips = (
    <div className="chip-row" role="radiogroup" aria-label="Macro split">
      {(Object.keys(macroPresets) as Preset[]).map((key) => (
        <button key={key} role="radio" aria-checked={preset === key} className="chip" onClick={() => update({ macroPlan: macroPresets[key].plan })}>
          {macroPresets[key].label}
        </button>
      ))}
      {preset === "custom" && (
        <button role="radio" aria-checked className="chip">
          Custom
        </button>
      )}
    </div>
  );
  if (!t.calc) {
    return (
      <div className="field">
        {chips}
        <MissingDetails missing={t.missing} lead="Grams follow your budget, so they need your" />
      </div>
    );
  }
  const calc = t.calc;
  const set = (proteinG: number, fatG: number) => update({ macroPlan: customMacroPlan(proteinG, fatG, calc) });
  const fatMin = Math.round((0.15 * calc.budgetKcal) / 9);
  const { proteinPerKg, fatPct: planFatPct } = draft.macroPlan;
  // Low carb and Keto set a carb share and fat takes the rest, so their fat share comes from the grams.
  const fatPct = Math.round((planFatPct ?? (t.fat * 9) / calc.budgetKcal) * 100);
  const perKg = Math.round(proteinPerKg * 100) / 100;

  return (
    <>
      {chips}
      <MacroSlider
        name="Protein"
        tone="protein"
        grams={t.protein}
        min={Math.round(0.8 * calc.proteinKg)}
        max={Math.round(2.5 * calc.proteinKg)}
        onChange={(g) => set(g, t.fat)}
        note={`${perKg} g per kg`}
      />
      <MacroSlider
        name="Fat"
        tone="fat"
        grams={t.fat}
        min={fatMin}
        max={Math.max(fatMin, Math.floor((calc.budgetKcal - t.protein * 4) / 9))}
        onChange={(g) => set(t.protein, g)}
        note={`${fatPct}% of calories`}
      />
      <h2 className="list-heading budget-heading">How your macros are worked out</h2>
      <dl className="goal-math">
        <div className="math-protein">
          <dt>
            Protein: {perKg} g × {Math.round(calc.proteinKg)} kg
            <small>Your target or current weight, capped at a healthy BMI</small>
          </dt>
          <dd>{t.protein} g</dd>
        </div>
        <div className="math-fat">
          <dt>
            Fat: {fatPct}% of {fmt(calc.budgetKcal)} kcal
          </dt>
          <dd>{t.fat} g</dd>
        </div>
        <div className="math-carbs">
          <dt>
            Carbs: {fmt(calc.budgetKcal)} − {fmt(t.protein * 4)} − {fmt(t.fat * 9)} kcal
            <small>What's left once protein (4 kcal a gram) and fat (9) are in, at 4 kcal a gram</small>
          </dt>
          <dd>{t.carbs} g</dd>
        </div>
        <div className="math-total">
          <dt>Your daily budget</dt>
          <dd>{fmt(t.kcal)} kcal</dd>
        </div>
      </dl>
    </>
  );
}

function MacroSlider({ name, tone, grams, min, max, onChange, note }: { name: string; tone: "protein" | "fat"; grams: number; min: number; max: number; onChange: (g: number) => void; note: string }) {
  return (
    <div className={`field macro-slider macro-slider-${tone}`}>
      <div className="slider-head">
        <h2 className="list-heading">{name}</h2>
        <label className="slider-value">
          <NumberInput integer aria-label={`${name} grams`} value={grams} onChange={(n) => n !== undefined && n > 0 && onChange(n)} />g
        </label>
      </div>
      <input className="slider" type="range" aria-label={`${name} grams`} min={min} max={max} step={1} value={Math.min(Math.max(grams, min), max)} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="slider-ends">
        <span>{min} g</span>
        <span>{note}</span>
        <span>{max} g</span>
      </div>
    </div>
  );
}

/** One number, so the keyboard's Go saves; last week's drinking shows what the target asks of you. */
export function FluidFields({ draft, update, onSubmit }: FieldsProps & { onSubmit: () => void }) {
  const today = todayKey();
  const logged = useGoalDays(shiftDate(today, -7), shiftDate(today, -1)).filter((d) => d.totals);
  const average = logged.length ? averageOf(logged, (d) => d.totals!.fluid.value) : undefined;
  return (
    <form
      className="big-entry"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p className="big-entry-note">Your daily target</p>
      <label className="kcal-field">
        <NumberInput integer enterKeyHint="go" value={Math.round(draft.fluidGoalMl)} onChange={(n) => n && n > 0 && update({ fluidGoalMl: n })} />
        <span>ml</span>
      </label>
      {average !== undefined && <p className="big-entry-note">You averaged {formatFluid(average)} a day over the last 7 days</p>}
      <p className="hint">Drinks measured in ml count toward it. About 2 L a day is a common target; food covers some water too.</p>
    </form>
  );
}

/** Newest first; each start date lists only the areas that changed on it. */
function planChanges(h: PlanAreas) {
  const byFrom = new Map<string, string[]>();
  const add = (from: string, part: string) => byFrom.set(from, [...(byFrom.get(from) ?? []), part]);
  for (const v of h.goal) add(v.from, v.value.goal.kgPerWeek > 0 ? `−${formatWeight(v.value.goal.kgPerWeek)}/week` : "Maintain");
  for (const v of h.macros) add(v.from, macroPresetLabel(v.value.macroPlan.preset));
  for (const v of h.metabolism) add(v.from, `× ${v.value.metabolismMultiplier}`);
  for (const v of h.fluid) add(v.from, `💧 ${formatFluid(v.value.fluidGoalMl)}`);
  return [...byFrom].sort(([a], [b]) => b.localeCompare(a));
}
