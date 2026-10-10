import { useState } from "react";
import { activityIcons, IconPicker } from "./IconPicker";
import { burnBasisLabel, defaultBurn, estimateBurn } from "../data/burn";
import { useProfile } from "../data/profile";
import { formatWeight } from "../data/units";
import { bodyKgAt, useWeighIns } from "../data/weighIns";
import type { Activity, Burn, ExerciseMeasureKey } from "../data/types";
import { NumberInput } from "./NumberInput";

const measureLabels: Record<ExerciseMeasureKey, string> = {
  duration: "Duration",
  distance: "Distance",
  laps: "Laps",
  sets: "Sets",
  reps: "Reps",
  weight: "Weight",
};


/** The measures picked here are the fields offered when logging the activity. */
export function ActivityEditor({ activity, onSave, onPublish }: { activity: Activity; onSave: (a: Activity) => void; onPublish?: () => void }) {
  const [name, setName] = useState(activity.name);
  const [icon, setIcon] = useState(activity.icon);
  const [measures, setMeasures] = useState<ExerciseMeasureKey[]>(activity.measures);
  const [burn, setBurn] = useState<Burn | undefined>(activity.burn);
  const { units } = useProfile();
  const bodyKg = bodyKgAt(useWeighIns()).kg;
  const bases = (["distance", "reps", "duration"] as const).filter((b) => measures.includes(b));
  // Dropping the tracked measure a burn was based on leaves nothing to calculate from.
  const activeBurn = burn && bases.includes(burn.basis) ? burn : undefined;
  const factor = activeBurn && (activeBurn.basis === "distance" ? activeBurn.kcalPerKgKm : activeBurn.basis === "reps" ? activeBurn.kcalPerKgRep : activeBurn.met);
  const setFactor = (n: number) =>
    activeBurn &&
    setBurn(
      activeBurn.basis === "distance" ? { ...activeBurn, kcalPerKgKm: n } : activeBurn.basis === "reps" ? { ...activeBurn, kcalPerKgRep: n } : { ...activeBurn, met: n },
    );
  const example =
    activeBurn &&
    estimateBurn(
      { ...activity, burn: activeBurn },
      activeBurn.basis === "distance" ? { distance: { value: 5, unit: "km" } } : activeBurn.basis === "reps" ? { sets: { value: 3, unit: "sets" }, reps: { value: 10, unit: "reps" } } : { duration: { value: 30, unit: "min" } },
      bodyKg,
    );

  const toggle = (key: ExerciseMeasureKey) =>
    setMeasures(measures.includes(key) ? measures.filter((m) => m !== key) : (Object.keys(measureLabels) as ExerciseMeasureKey[]).filter((k) => k === key || measures.includes(k)));

  return (
    <div className="item-editor">
      <label className="field">
        <span className="field-label">Name</span>
        <input className="big-text" autoFocus={!activity.name} placeholder="e.g. Padel" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="field">
        <span className="field-label">Icon</span>
        <IconPicker value={icon} options={activityIcons} onChange={setIcon} />
      </div>

      <div className="field">
        <span className="field-label">What you track</span>
        <div className="chip-row">
          {(Object.keys(measureLabels) as ExerciseMeasureKey[]).map((key) => (
            <button key={key} className="chip" aria-pressed={measures.includes(key)} onClick={() => toggle(key)}>
              {measures.includes(key) ? "✓ " : ""}
              {measureLabels[key]}
            </button>
          ))}
        </div>
        <p className="hint">Shown as fields when you log it; every field stays optional.</p>
      </div>

      <div className="field">
        <span className="field-label">Calories from</span>
        <div className="segmented small">
          <button aria-selected={!activeBurn} onClick={() => setBurn(undefined)}>
            I'll enter them
          </button>
          {bases.map((b) => (
            <button key={b} aria-selected={activeBurn?.basis === b} onClick={() => setBurn(activity.burn?.basis === b ? activity.burn : defaultBurn[b])}>
              {burnBasisLabel[b]}
            </button>
          ))}
        </div>
        {activeBurn && (
          <>
            <label className="kcal-field">
              <NumberInput value={Number.isFinite(factor) ? factor : undefined} onChange={(n) => setFactor(n ?? NaN)} />
              <span>{activeBurn.basis === "distance" ? "kcal per kg per km" : activeBurn.basis === "reps" ? "kcal per kg per rep" : "MET (intensity)"}</span>
            </label>
            <p className="hint">
              {activeBurn.basis === "duration" && "Rest is 1, walking about 3.5, running 8–10. "}
              {example && `At ${formatWeight(bodyKg, units)} that's ≈${Math.round(example.kcal)} kcal for ${example.from}.`}
            </p>
          </>
        )}
        {bases.length === 0 && <p className="hint">Track distance, reps or duration to have calories calculated.</p>}
      </div>

      {onPublish && (
        <button className="row row-unsure" onClick={onPublish}>
          <span className="row-icon">📚</span>
          <span className="row-main">
            <span className="row-title">Publish to library</span>
            <span className="row-sub">Moves it from your activities to the library; this can't be undone</span>
          </span>
        </button>
      )}

      <div className="flow-footer">
        <button className="btn btn-primary btn-block" disabled={!name.trim() || measures.length === 0} onClick={() => onSave({ ...activity, name: name.trim(), icon, measures, burn: activeBurn && factor && factor > 0 ? activeBurn : undefined })}>
          Save
        </button>
      </div>
    </div>
  );
}
