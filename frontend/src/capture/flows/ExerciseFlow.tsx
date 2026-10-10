import { useCallback, useEffect, useState } from "react";
import { activityById, allActivities, starterActivityIds, useActivities } from "../../core/activities";
import { estimateBurn } from "../../core/burn";
import { recentActivityIds, saveEntry, useEntries } from "../../core/entries";
import { undoPoint } from "../../core/followUp";
import { useProfile } from "../../core/profile";
import { initialWhen, nowWhen } from "../../core/time";
import type { Activity, ExerciseEntry, ExerciseMeasureKey, When } from "../../core/types";
import { formatWeight, preferredDistance, type UnitSystem } from "../../core/units";
import { bodyKgAt, useWeighIns } from "../../core/weighIns";
import { FlowShell } from "../ui/FlowShell";
import { NumberInput } from "../ui/NumberInput";
import { useSteps } from "../ui/useSteps";
import { WhenPicker } from "../ui/WhenPicker";

type Step = "what" | "measures" | "when";

const measureSpec: Record<ExerciseMeasureKey, { label: string; units: string[]; quick: number[] }> = {
  distance: { label: "Distance", units: ["km", "m", "mi"], quick: [1, 2, 3, 5, 10] },
  duration: { label: "Duration", units: ["min", "h"], quick: [10, 20, 30, 45, 60] },
  laps: { label: "Laps", units: ["laps"], quick: [10, 20, 30, 40] },
  sets: { label: "Sets", units: ["sets"], quick: [3, 4, 5] },
  reps: { label: "Reps per set", units: ["reps"], quick: [5, 8, 10, 12] },
  weight: { label: "Weight", units: ["kg", "lb"], quick: [10, 20, 40, 60] },
};

const fallbackMeasures: ExerciseMeasureKey[] = ["duration", "distance"];

export type ExerciseMode = { kind: "new" } | { kind: "edit"; entry: ExerciseEntry } | { kind: "duplicate"; entry: ExerciseEntry };

const roundKcal = (n?: number) => (n === undefined ? undefined : Math.round(n));

export function ExerciseFlow({ date, mode = { kind: "new" }, onDone }: { date: string; mode?: ExerciseMode; onDone: (saved?: ExerciseEntry, undo?: () => void) => void }) {
  const source = mode.kind === "new" ? undefined : mode.entry;
  const exit = useCallback(() => onDone(), [onDone]);
  const entries = useEntries();
  const { step, depth, go, back, replace, close } = useSteps<Step>(source ? "measures" : "what", exit);

  const [when, setWhen] = useState<When>(() => (mode.kind === "edit" ? mode.entry.when : mode.kind === "duplicate" ? nowWhen() : initialWhen(date)));
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState(() => activityById(source?.activityId));
  const [rawName, setRawName] = useState(source?.rawName);
  const [measures, setMeasures] = useState<ExerciseEntry["measures"]>(source?.measures ?? {});
  const { units } = useProfile();
  const body = bodyKgAt(useWeighIns(), when.date);
  const burn = estimateBurn(activity, measures, body.kg);
  const [kcal, setKcal] = useState(source?.kcal);
  const [manual, setManual] = useState(source?.kcalManual ?? false);

  // A reload keeps the step in history but not what was picked, so start the pick over.
  useEffect(() => {
    if (!source && step === "measures" && !activity && !rawName) replace("what");
  }, []);

  const pick = (a: Activity | string) => {
    if (typeof a === "string") {
      setActivity(undefined);
      setRawName(a);
    } else {
      setActivity(a);
      setRawName(undefined);
    }
    setMeasures({});
    go("measures");
  };

  const save = () => {
    const undo = undoPoint();
    const entry: ExerciseEntry = {
      id: mode.kind === "edit" ? mode.entry.id : crypto.randomUUID(),
      kind: "exercise",
      when,
      createdAt: mode.kind === "edit" ? mode.entry.createdAt : new Date().toISOString(),
      activityId: activity?.id,
      rawName,
      measures,
      kcal: manual ? kcal : roundKcal(burn?.kcal),
      kcalManual: manual || undefined,
    };
    saveEntry(entry);
    onDone(entry, undo);
    close();
  };

  if (step === "when")
    return (
      <FlowShell title="When?" canGoBack onBack={back} onClose={close}>
        <WhenPicker value={when} onChange={setWhen} onDone={back} />
      </FlowShell>
    );

  if (step === "measures")
    return (
      <FlowShell
        title={activity?.name ?? `“${rawName}”`}
        subtitle={!activity && <span className="badge badge-warn">Not in your activities</span>}
        canGoBack={depth > 1}
        onBack={back}
        onClose={close}
        when={when}
        onWhen={() => go("when")}
        footer={
          <button className="btn btn-primary btn-block" onClick={save}>
            Save
          </button>
        }
      >
        <p className="hint">Fill in whatever you know. Everything is optional.</p>
        {basisFirst(activity).map((key) => (
          <MeasureField
            key={key}
            measure={key}
            drivesBurn={activity?.burn?.basis === key}
            units={units}
            value={measures[key]}
            onChange={(v) => setMeasures((m) => ({ ...m, [key]: v }))}
          />
        ))}
        <div className="measure">
          <div className="measure-label">Extra calories burned</div>
          {activity?.burn && !manual ? (
            <div className="burn-calc">
              <div className="kcal-total">
                <strong>{burn ? roundKcal(burn.kcal) : "?"}</strong>
                <span>kcal</span>
              </div>
              <div className="burn-why">
                {burn ? `From ${burn.from} at ${formatWeight(body.kg, units)}${body.known ? "" : " (no weigh-in yet)"}` : `Fill in ${activity.burn.basis} to work it out`}
                <button
                  className="link-btn"
                  onClick={() => {
                    setKcal(roundKcal(burn?.kcal));
                    setManual(true);
                  }}
                >
                  Enter my own
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="kcal-field">
                <NumberInput integer placeholder="?" value={kcal} onChange={setKcal} />
                <span>kcal</span>
              </label>
              {activity?.burn && (
                <button className="link-btn" onClick={() => setManual(false)}>
                  Work it out instead{burn ? ` (${roundKcal(burn.kcal)})` : ""}
                </button>
              )}
            </>
          )}
          <p className="hint">Only the burn on top of your normal day. Watches often report the total.</p>
        </div>
      </FlowShell>
    );

  return (
    <FlowShell title="I exercised" canGoBack={false} onBack={back} onClose={close} when={when} onWhen={() => go("when")}>
      <ActivityPicker recent={recentActivityIds(entries)} query={query} onQuery={setQuery} onPick={pick} />
    </FlowShell>
  );
}

/** Logged activities first, starters before anything is logged, and search over the rest. */
function ActivityPicker({ recent, query, onQuery, onPick }: { recent: string[]; query: string; onQuery: (q: string) => void; onPick: (a: Activity | string) => void }) {
  useActivities();
  const q = query.trim().toLowerCase();
  const all = allActivities();
  const tiles = [...recent, ...starterActivityIds]
    .map(activityById)
    .filter((a, i, list): a is Activity => !!a && !a.deleted && list.indexOf(a) === i)
    .slice(0, 8);
  const matches = q ? all.filter((a) => a.name.toLowerCase().includes(q)) : all.filter((a) => !tiles.includes(a));

  return (
    <>
      <div className="search-bar">
        <input type="search" placeholder="Search activities" value={query} onChange={(e) => onQuery(e.target.value)} />
      </div>
      {!q && (
        <div className="activity-grid">
          {tiles.map((a) => (
            <button key={a.id} className="tile" onClick={() => onPick(a)}>
              <span className="tile-icon">{a.icon}</span>
              <span className="tile-label">{a.name}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="list">
        {q && (
          <li>
            <button className="row row-unsure" onClick={() => onPick(query.trim())}>
              <span className="row-icon">✎</span>
              <span className="row-main">
                <span className="row-title">“{query.trim()}”</span>
                <span className="row-sub">Not in your activities yet, sort it out later</span>
              </span>
            </button>
          </li>
        )}
        {!q && <li className="list-heading">Everything else</li>}
        {matches.map((a) => (
          <li key={a.id}>
            <button className="row" onClick={() => onPick(a)}>
              <span className="row-icon">{a.icon}</span>
              <span className="row-main">
                <span className="row-title">{a.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The measure that drives the calories goes first; the rest are only recorded. */
function basisFirst(activity?: Activity): ExerciseMeasureKey[] {
  const all = activity?.measures ?? fallbackMeasures;
  const basis = activity?.burn?.basis;
  return basis && all.includes(basis) ? [basis, ...all.filter((m) => m !== basis)] : all;
}

function MeasureField({
  measure,
  value,
  onChange,
  drivesBurn = false,
  units,
}: {
  units: UnitSystem;
  drivesBurn?: boolean;
  measure: ExerciseMeasureKey;
  value?: { value: number; unit: string };
  onChange: (v?: { value: number; unit: string }) => void;
}) {
  const spec = measureSpec[measure];
  const preferred = measure === "distance" ? preferredDistance(units) : measure === "weight" ? (units === "metric" ? "kg" : "lb") : spec.units[0];
  const [unit, setUnit] = useState(value?.unit ?? preferred);
  const set = (n?: number, u = unit) => onChange(n === undefined ? undefined : { value: n, unit: u });

  return (
    <div className="measure">
      <div className="measure-label">
        {spec.label} {drivesBurn && <span className="badge badge-muted">🔥 Calories</span>}
      </div>
      <div className="measure-input">
        <NumberInput placeholder="–" value={value?.value} onChange={(n) => set(n)} />
        {spec.units.length > 1 ? (
          <div className="segmented small">
            {spec.units.map((u) => (
              <button
                key={u}
                aria-selected={u === unit}
                onClick={() => {
                  setUnit(u);
                  set(value?.value, u);
                }}
              >
                {u}
              </button>
            ))}
          </div>
        ) : (
          <span className="unit">{unit}</span>
        )}
      </div>
      <div className="chip-row">
        {spec.quick.map((n) => (
          <button key={n} className="chip chip-ghost" aria-pressed={value?.value === n} onClick={() => set(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
