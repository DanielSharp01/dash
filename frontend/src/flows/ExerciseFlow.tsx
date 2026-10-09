import { useCallback, useEffect, useMemo, useState } from "react";
import { activityById, allActivities } from "../data/catalogue";
import { useUserActivities } from "../data/userActivities";
import { estimateBurn } from "../data/burn";
import { useProfile } from "../data/profile";
import { formatWeight, preferredDistance, type UnitSystem } from "../data/units";
import { bodyKgAt, useWeighIns } from "../data/weighIns";
import { addEntry, recentIds, updateEntry, useEntries } from "../data/store";
import { setMyActivities, toggleMyActivity, useMyActivities } from "../data/myActivities";
import { initialWhen, nowWhen } from "../data/time";
import type { Activity, ExerciseEntry, ExerciseMeasureKey, ImportSource, When } from "../data/types";
import { FlowShell } from "../components/FlowShell";
import { useSteps } from "../components/useSteps";
import { WhenPicker } from "../components/WhenPicker";
import { NumberInput } from "../components/NumberInput";

type Step = "what" | "catalogue" | "measures" | "when";

const measureSpec: Record<ExerciseMeasureKey, { label: string; units: string[]; quick: number[] }> = {
  distance: { label: "Distance", units: ["km", "m", "mi"], quick: [1, 2, 3, 5, 10] },
  duration: { label: "Duration", units: ["min", "h"], quick: [10, 20, 30, 45, 60] },
  laps: { label: "Laps", units: ["laps"], quick: [10, 20, 30, 40] },
  sets: { label: "Sets", units: ["sets"], quick: [3, 4, 5] },
  reps: { label: "Reps per set", units: ["reps"], quick: [5, 8, 10, 12] },
  weight: { label: "Weight", units: ["kg", "lb"], quick: [10, 20, 40, 60] },
};

const importLabels: Record<ImportSource, string> = {
  gpx: "📍 GPX file",
  fit: "⌚ FIT file",
  "health-connect": "❤️ Health Connect",
};

const fallbackMeasures: ExerciseMeasureKey[] = ["duration", "distance"];

export type ExerciseFlowMode = { kind: "new" } | { kind: "edit"; entry: ExerciseEntry } | { kind: "duplicate"; entry: ExerciseEntry };

export function ExerciseFlow({
  date,
  mode = { kind: "new" },
  onDone,
}: {
  date: string;
  mode?: ExerciseFlowMode;
  onDone: (saved?: ExerciseEntry, previous?: ExerciseEntry) => void;
}) {
  const source = mode.kind === "new" ? undefined : mode.entry;
  const exit = useCallback(() => onDone(), [onDone]);
  const entries = useEntries();
  const stored = useMyActivities();
  const used = useMemo(() => recentIds(entries, "exercise", (e) => e.activityId), [entries]);
  // Before anyone picks, the activities they've already logged count as theirs.
  const mine = stored ?? used;
  const [onboarding] = useState(() => mine.length === 0);
  const { step, depth, go, back, replace, close } = useSteps<Step>(source ? "measures" : onboarding ? "catalogue" : "what", exit);

  const [when, setWhen] = useState<When>(() => (mode.kind === "edit" ? mode.entry.when : mode.kind === "duplicate" ? nowWhen() : initialWhen(date)));
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState(() => activityById(source?.activityId));
  const [rawName, setRawName] = useState(source?.rawName);
  const [measures, setMeasures] = useState<ExerciseEntry["measures"]>(source?.measures ?? {});
  const { units } = useProfile();
  const weighIns = useWeighIns();
  const body = bodyKgAt(weighIns, when.date);
  const bodyKg = body.kg;
  const burn = estimateBurn(activity, measures, bodyKg);
  const [kcal, setKcal] = useState(source?.kcalEstimate);

  // A reload keeps the step in history but not what was picked, so start the pick over.
  useEffect(() => {
    if (!source && step === "measures" && !activity && !rawName) replace("what");
  }, []);
  // Entries from before calculated burn existed count as typed unless they match the calculation.
  const [manual, setManual] = useState(
    () => source?.kcalManual ?? (source?.kcalEstimate !== undefined && source.kcalEstimate !== roundKcal(estimateBurn(activityById(source.activityId), source.measures, bodyKg)?.kcal)),
  );

  const pick = (a: Activity | string) => {
    if (typeof a === "string") {
      setActivity(undefined);
      setRawName(a);
    } else {
      setActivity(a);
      setRawName(undefined);
    }
    setMeasures({});
    if (typeof a !== "string" && !mine.includes(a.id)) setMyActivities([...mine, a.id]);
    go("measures");
  };

  const save = () => {
    const entry: ExerciseEntry = {
      id: mode.kind === "edit" ? mode.entry.id : crypto.randomUUID(),
      kind: "exercise",
      when,
      createdAt: mode.kind === "edit" ? mode.entry.createdAt : new Date().toISOString(),
      activityId: activity?.id,
      rawName,
      measures,
      kcalEstimate: manual ? kcal : roundKcal(burn?.kcal),
      kcalManual: manual || undefined,
      followUp: activity ? "done-with-item" : "needs-follow-up",
    };
    if (mode.kind === "edit") updateEntry(entry);
    else addEntry(entry);
    onDone(entry, mode.kind === "edit" ? mode.entry : undefined);
    close();
  };

  if (step === "when")
    return (
      <FlowShell title="When?" canGoBack onBack={back} onClose={close}>
        <WhenPicker value={when} onChange={setWhen} onDone={back} />
      </FlowShell>
    );

  if (step === "catalogue")
    return (
      <FlowShell
        title={onboarding ? "Which activities do you do?" : "All activities"}
        canGoBack={!onboarding}
        onBack={back}
        onClose={close}
        footer={
          onboarding && (
            <button className="btn btn-primary btn-block" disabled={mine.length === 0} onClick={() => replace("what")}>
              Done
            </button>
          )
        }
      >
        <ActivityCatalogue
          mine={mine}
          onToggle={(id) => {
            if (stored === null) setMyActivities(used);
            toggleMyActivity(id);
          }}
          onPick={onboarding ? undefined : pick}
        />
      </FlowShell>
    );

  if (step === "measures")
    return (
      <FlowShell
        title={activity?.name ?? `“${rawName}”`}
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
        {!activity && (
          <div className="notice">
            <span>
              <span className="badge badge-warn">Not in your activities</span> You can pick the right one later.
            </span>
          </div>
        )}
        {activity?.imports && (
          <div className="import-options">
            <span className="measure-label">Import a recording</span>
            <div className="chip-row">
              {activity.imports.map((src) => (
                <button key={src} className="chip" disabled title="Coming later">
                  {importLabels[src]}
                </button>
              ))}
            </div>
            <p className="hint">Coming later. Or fill in what you know below; everything is optional.</p>
          </div>
        )}
        {!activity?.imports && <p className="hint">Fill in whatever you know. Everything is optional.</p>}
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
                <strong>{burn ? `≈${roundKcal(burn.kcal)}` : "?"}</strong>
                <span>kcal</span>
              </div>
              <div className="burn-why">
                {burn ? `From ${burn.from} at ${formatWeight(bodyKg, units)}${body.known ? "" : " (no weigh-in yet)"}` : `Fill in ${activity.burn.basis} to calculate it`}
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
                <span>kcal (estimate)</span>
              </label>
              {activity?.burn && (
                <button className="link-btn" onClick={() => setManual(false)}>
                  Use calculated{burn ? ` (≈${roundKcal(burn.kcal)})` : ""}
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
      <ActivityList mine={mine} used={used} query={query} onQuery={setQuery} onPick={pick} onMore={() => go("catalogue")} />
    </FlowShell>
  );
}

function ActivityList({
  mine,
  used,
  query,
  onQuery,
  onPick,
  onMore,
}: {
  mine: string[];
  used: string[];
  query: string;
  onQuery: (q: string) => void;
  onPick: (a: Activity | string) => void;
  onMore: () => void;
}) {
  const yours = useMemo(() => {
    const order = [...used.filter((id) => mine.includes(id)), ...mine.filter((id) => !used.includes(id))];
    return order.map(activityById).filter((a): a is Activity => !!a && !a.deleted);
  }, [mine, used]);
  const q = query.trim().toLowerCase();
  useUserActivities();
  const others = q ? allActivities().filter((a) => !mine.includes(a.id) && a.name.toLowerCase().includes(q)) : [];
  const shown = q ? yours.filter((a) => a.name.toLowerCase().includes(q)) : yours;

  return (
    <>
      <div className="search-bar">
        <input type="search" placeholder="Search activities" value={query} onChange={(e) => onQuery(e.target.value)} />
      </div>
      <div className="activity-grid">
        {shown.map((a) => (
          <button key={a.id} className="tile" onClick={() => onPick(a)}>
            <span className="tile-icon">{a.icon}</span>
            <span className="tile-label">{a.name}</span>
          </button>
        ))}
        {!q && (
          <button className="tile tile-more" onClick={onMore}>
            <span className="tile-icon">＋</span>
            <span className="tile-label">More</span>
          </button>
        )}
      </div>
      {others.length > 0 && (
        <ul className="list">
          <li className="list-heading">From all activities</li>
          {others.map((a) => (
            <li key={a.id}>
              <button className="row" onClick={() => onPick(a)}>
                <span className="row-icon">{a.icon}</span>
                <span className="row-main">
                  <span className="row-title">
                    {a.name} {!a.library && <span className="badge badge-muted">Yours</span>}
                  </span>
                  <span className="row-sub">Gets added to your activities</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q && (
        <button className="row row-unsure" onClick={() => onPick(query.trim())}>
          <span className="row-icon">✎</span>
          <span className="row-main">
            <span className="row-title">“{query.trim()}”</span>
            <span className="row-sub">Not in your activities yet, sort it out later</span>
          </span>
        </button>
      )}
    </>
  );
}

export function ActivityCatalogue({
  mine,
  onToggle,
  onPick,
  onCreate,
  hint,
}: {
  mine: string[];
  onToggle: (id: string) => void;
  onPick?: (a: Activity) => void;
  /** Offers a "new activity" row, prefilled with what was searched. */
  onCreate?: (name: string) => void;
  hint?: string;
}) {
  const [query, setQuery] = useState("");
  useUserActivities();
  const q = query.trim().toLowerCase();
  const all = allActivities();
  const shown = q ? all.filter((a) => a.name.toLowerCase().includes(q)) : all;

  return (
    <>
      <p className="hint">
        {hint ?? (onPick ? "Tap one to log it. Star the ones you do so they show up first." : "Star the ones you do. You can change this any time.")}
      </p>
      <div className="search-bar">
        <input type="search" placeholder="Search activities" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {onCreate && (
        <button className="row row-create" onClick={() => onCreate(query.trim())}>
          <span className="row-icon">＋</span>
          <span className="row-main">
            <span className="row-title">{q ? `New activity “${query.trim()}”` : "New activity"}</span>
          </span>
        </button>
      )}
      <ul className="list">
        {shown.map((a) => {
          const starred = mine.includes(a.id);
          return (
            <li key={a.id} className="catalogue-row">
              <button className="row" onClick={() => (onPick ? onPick(a) : onToggle(a.id))}>
                <span className="row-icon">{a.icon}</span>
                <span className="row-main">
                  <span className="row-title">
                    {a.name} {!a.library && <span className="badge badge-muted">Yours</span>}
                  </span>
                </span>
              </button>
              <button
                className={`star-btn ${starred ? "starred" : ""}`}
                aria-pressed={starred}
                aria-label={starred ? `Remove ${a.name} from your activities` : `Add ${a.name} to your activities`}
                onClick={() => onToggle(a.id)}
              >
                {starred ? "★" : "☆"}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const roundKcal = (n?: number) => (n === undefined ? undefined : Math.round(n));

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
