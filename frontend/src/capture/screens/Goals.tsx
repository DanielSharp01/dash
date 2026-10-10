import { WeightInput } from "../ui/BodyInputs";
import { FlowShell } from "../ui/FlowShell";
import { useSteps } from "../ui/useSteps";
import { currentPlan, dailyTargets, latestPlanStart, MIN_KCAL, samePlan, savePlan, targetDate } from "../../core/goals";
import { todayKey } from "../../core/time";
import { useWeighIns } from "../../core/weighIns";
import { useState } from "react";
import { macroPresets, type MacroPreset, type Plan, useProfile } from "../../core/profile";
import { BEGINNING } from "../../core/types";
import { fluidUnit, formatFluid, formatWeight, fromDisplayFluid, fromDisplayWeight, toDisplayFluid, type UnitSystem } from "../../core/units";
import { NumberInput } from "../ui/NumberInput";
import { MissingDetails } from "../ui/MissingDetails";

const paces: Record<UnitSystem, number[]> = { metric: [0, 0.25, 0.5, 0.75], imperial: [0, 0.5, 1, 1.5] };
const fmt = (n: number) => Math.round(n).toLocaleString();

export function GoalsScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"goal">("goal");
  const profile = useProfile();
  const { units } = profile;
  // Edits stay a draft so trying out options doesn't create a version per tap.
  const [draft, setDraft] = useState<Plan>(() => currentPlan(profile));
  const updatePlan = (patch: Partial<Plan>) => setDraft((d) => ({ ...d, ...patch }));
  const goal = draft.goal;
  const t = dailyTargets({ ...profile, ...draft, planHistory: undefined }, useWeighIns());
  const dirty = !samePlan(draft, currentPlan(profile));
  const [change, setChange] = useState<"fix" | "changed">();
  const [resetKey, setResetKey] = useState(0);
  const [from, setFrom] = useState(todayKey);
  const since = latestPlanStart(profile);
  const fromValid = !!from && from >= since;
  const finish = t.calc && targetDate(t.calc.bodyKg, goal);
  const history = profile.planHistory ?? [];
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
            <div className="segmented small">
              <button aria-selected={change === "fix"} onClick={() => setChange("fix")}>
                Fix a mistake
              </button>
              <button aria-selected={change === "changed"} onClick={() => setChange("changed")}>
                New goal from…
              </button>
            </div>
            {change === "fix" && <p className="hint">Rewrites the current goal; past days are judged by it too.</p>}
            {change === "changed" && (
              <label className="measure-def">
                Starting
                <input className="text-input" type="date" min={since === BEGINNING ? undefined : since} value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
            )}
            {change === "changed" && <p className="hint">{fromValid ? "Days before keep the goal they had." : "Pick a day on or after the current goal started."}</p>}
            <div className="plan-save-buttons">
              <button
                className="btn"
                onClick={() => {
                  setDraft(currentPlan(profile));
                  setResetKey((k) => k + 1);
                }}
              >
                Discard
              </button>
              <button
                className="btn btn-primary btn-block"
                disabled={!change || (change === "changed" && !fromValid)}
                onClick={() => {
                  savePlan(draft, change === "fix" ? "fix" : { from });
                  setChange(undefined);
                }}
              >
                Save
              </button>
            </div>
          </div>
        )
      }
    >
      <section className="goal-budget">
        <div className="kcal-total">
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
        <p className="hint">Per week. Slower is easier to keep up; most guidance tops out around 1% of body weight a week.</p>
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

      {history.length > 1 && (
        <details className="version-history">
          <summary>History · {history.length} versions</summary>
          <ul>
            {[...history].reverse().map((h) => (
              <li key={h.from}>
                <span>
                  <b>{h.from !== BEGINNING ? `Since ${new Date(`${h.from}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "Before"}</b>
                  {describePlan(h.plan, units)}
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

function describePlan(p: Plan, units: UnitSystem) {
  const pace = p.goal.kgPerWeek > 0 ? `−${formatWeight(p.goal.kgPerWeek, units)}/week` : "Maintain";
  return [pace, macroPresets[p.macroPlan.preset].label, `× ${p.metabolismMultiplier}`, `💧 ${formatFluid(p.fluidGoalMl, units)}`].join(" · ");
}
