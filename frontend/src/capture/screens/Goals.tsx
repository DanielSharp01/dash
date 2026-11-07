import { useState } from "react";
import {
  BEGINNING,
  changeStartsFrom,
  dailyTargets,
  fluidUnit,
  formatFluid,
  formatWeight,
  fromDisplayFluid,
  fromDisplayWeight,
  macroPresets,
  type MacroPreset,
  MIN_KCAL,
  type Plan,
  type PlanAreas,
  planAt,
  samePlan,
  splitPlanVersions,
  toDisplayFluid,
  toDisplayWeight,
  type UnitSystem,
  weightUnit,
} from "@dash/core";
import { savePlan, useMe } from "../../queries/me.queries";
import { useWeighIns } from "../../queries/weighIns.queries";
import { targetDate } from "../body";
import { todayKey } from "../time";
import { WeightInput } from "../ui/BodyInputs";
import { FlowShell } from "../ui/FlowShell";
import { MissingDetails } from "../ui/MissingDetails";
import { NumberInput } from "../ui/NumberInput";
import { DateChip, tapCard } from "../ui/DateChip";
import { Sheet } from "../ui/Sheet";
import { useSteps } from "../ui/useSteps";

const paces: Record<UnitSystem, number[]> = { metric: [0, 0.25, 0.5, 0.75], imperial: [0, 0.5, 1, 1.5] };
const fmt = (n: number) => Math.round(n).toLocaleString();

export function GoalsScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"goal">("goal");
  const { profile, plan: history } = useMe();
  const { units } = profile;
  const current = planAt(history);
  // Edits stay a draft so trying out options doesn't create a version per tap.
  const [draft, setDraft] = useState<Plan>(current);
  const updatePlan = (patch: Partial<Plan>) => setDraft((d) => ({ ...d, ...patch }));
  const goal = draft.goal;
  const t = dailyTargets(profile, splitPlanVersions([{ from: BEGINNING, plan: draft }]), useWeighIns());
  const dirty = !samePlan(draft, current);
  const [asking, setAsking] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [from, setFrom] = useState(todayKey);
  const since = changeStartsFrom(history, draft);
  const fromValid = !!from && from >= since;
  const finish = t.calc && targetDate(t.calc.bodyKg, goal);
  const changes = planChanges(history, units);
  const saveAs = (change: "fix" | { from: string }) => {
    void savePlan(draft, change);
    setAsking(false);
  };
  const targetTooHigh = !!t.calc && goal.targetKg !== undefined && goal.targetKg >= t.calc.bodyKg;

  return (
    <FlowShell
      title="Goal"
      canGoBack={false}
      onBack={close}
      onClose={close}
      onMenu={onMenu}
      footer={
        dirty && (
          <div className="plan-save">
            <div className="plan-save-buttons">
              <button
                className="btn"
                onClick={() => {
                  setDraft(current);
                  setResetKey((k) => k + 1);
                }}
              >
                Discard
              </button>
              <button className="btn btn-primary btn-block" onClick={() => setAsking(true)}>
                Save
              </button>
            </div>
          </div>
        )
      }
    >
      {asking && (
        <Sheet title="Save the goal" onClose={() => setAsking(false)}>
          <button className="row row-choice" onClick={() => saveAs("fix")}>
            <span className="row-main">
              <span className="row-title">Edit current goal</span>
              <span className="row-sub">Past days are judged by it too</span>
            </span>
          </button>
          <div className="row row-choice" {...tapCard(() => saveAs({ from }), !fromValid)}>
            <span className="row-main">
              <span className="row-title">New goal</span>
              <span className="row-sub">{fromValid ? "Days before keep the goal they had" : "Pick a day on or after the current goal started"}</span>
              <DateChip prefix="Starting" value={from} min={since === BEGINNING ? undefined : since} onChange={setFrom} />
            </span>
          </div>
        </Sheet>
      )}
      <section className="goal-budget">
        <div className="kcal-total goal-budget-card">
          <strong>{fmt(t.kcal)}</strong>
          <span>kcal a day</span>
        </div>
        <p className="hint">Plus whatever you burn in logged exercise.</p>
      </section>

      {t.missing.length > 0 ? (
        <MissingDetails missing={t.missing} lead="Using a placeholder until Dash knows your" />
      ) : (
        t.calc && (
          <dl className="goal-math">
            <div>
              <dt>Resting burn</dt>
              <dd>{fmt(t.calc.bmr)}</dd>
            </div>
            <div>
              <dt>
                × {draft.metabolismMultiplier} metabolism
                {draft.calibratedFrom && ` (from ${fmt(draft.calibratedFrom.maintenanceKcal)} kcal maintenance)`}
              </dt>
              <dd>{fmt(t.calc.maintenance)}</dd>
            </div>
            {t.calc.deficit > 0 && (
              <div>
                <dt>− losing {formatWeight(goal.kgPerWeek, units)} a week</dt>
                <dd>−{fmt(t.calc.deficit)}</dd>
              </div>
            )}
            {t.calc.clamped && (
              <div>
                <dt>Kept at the {fmt(MIN_KCAL)} kcal minimum</dt>
                <dd>{fmt(t.kcal)}</dd>
              </div>
            )}
          </dl>
        )
      )}

      <div className="field">
        <span className="field-label">Pace</span>
        <div className="segmented small">
          {paces[units].map((p) => {
            const kg = fromDisplayWeight(p, units);
            return (
              <button key={p} aria-selected={Math.abs(goal.kgPerWeek - kg) < 0.01} onClick={() => updatePlan({ goal: { ...goal, kgPerWeek: kg } })}>
                {p === 0 ? "Maintain" : `−${p} ${units === "metric" ? "kg" : "lb"}`}
              </button>
            );
          })}
        </div>
        <label className="measure-def multiplier-custom">
          Or exactly
          <NumberInput
            aria-label="Pace per week"
            value={toDisplayWeight(goal.kgPerWeek, units)}
            onChange={(n) => n !== undefined && updatePlan({ goal: { ...goal, kgPerWeek: fromDisplayWeight(n, units) } })}
          />
          {weightUnit(units)} a week
        </label>
        <p className="hint">
          {t.calc && goal.kgPerWeek > t.calc.bodyKg * 0.01
            ? "That's more than 1% of your body weight a week, faster than most guidance suggests."
            : "Per week. Slower is easier to keep up; most guidance tops out around 1% of body weight a week."}
        </p>
      </div>

      {goal.kgPerWeek > 0 && (
        <div className="field">
          <span className="field-label">Target weight (optional)</span>
          <WeightInput key={`${units}-${resetKey}`} kg={goal.targetKg} units={units} onChange={(targetKg) => updatePlan({ goal: { ...goal, targetKg } })} />
          {targetTooHigh && <p className="hint">Dash is built for losing or holding weight, so the target needs to be below your current weight.</p>}
          {finish && <p className="hint">At this pace you'd get there around {finish.toLocaleDateString(undefined, { month: "long", year: "numeric" })}.</p>}
        </div>
      )}

      <div className="field">
        <span className="field-label">Daily fluid</span>
        <label className="kcal-field">
          <NumberInput key={units} integer value={toDisplayFluid(draft.fluidGoalMl, units)} onChange={(n) => n && n > 0 && updatePlan({ fluidGoalMl: fromDisplayFluid(n, units) })} />
          <span>{fluidUnit(units)}</span>
        </label>
        <p className="hint">Drinks measured in ml count toward it. About 2 L a day is a common target; food covers some water too.</p>
      </div>

      <div className="field">
        <span className="field-label">Daily macros</span>
        <div className="chip-row" role="radiogroup" aria-label="Macro split">
          {(Object.keys(macroPresets) as MacroPreset[]).map((key) => (
            <button key={key} role="radio" aria-checked={draft.macroPlan.preset === key} className="chip" onClick={() => updatePlan({ macroPlan: macroPresets[key].plan })}>
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
