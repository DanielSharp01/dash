import { useEffect, useState } from "react";
import { BirthdayInput, HeightInput, WeightInput } from "../components/BodyInputs";
import { FlowShell } from "../components/FlowShell";
import { useSteps } from "../components/useSteps";
import { setMyActivities, toggleMyActivity, useMyActivities } from "../data/myActivities";
import { ADULT_AGE, ageOn, updateProfile, useProfile } from "../data/profile";
import { correctPlan, dailyTargets } from "../data/goals";
import type { Entry } from "../data/types";
import { useEntries } from "../data/store";
import { exportData, importData } from "../data/persist";
import { shiftDate, todayKey } from "../data/time";
import { formatHeight, formatWeight, toDisplayWeight, type UnitSystem, weightUnit } from "../data/units";
import { addWeighIn, removeWeighIn, restoreWeighIns, useWeighIns, type WeighIn, weighInsSnapshot } from "../data/weighIns";
import { ActivityCatalogue } from "../flows/ExerciseFlow";
import { activityById } from "../data/catalogue";
import type { Notify } from "./ItemScreens";

type OnboardingStep = "units" | "body" | "age" | "activities" | "done";
const order: OnboardingStep[] = ["units", "body", "age", "activities", "done"];

export function Onboarding() {
  const { step, go, back, depth } = useSteps<OnboardingStep>("units");
  const profile = useProfile();
  const mine = useMyActivities() ?? [];
  const [kg, setKg] = useState<number>();
  const next = () => go(order[order.indexOf(step) + 1]);
  const targets = dailyTargets(profile, kg ? [{ id: "draft", date: todayKey(), kg }] : []);

  const finish = () => {
    if (kg) addWeighIn({ id: crypto.randomUUID(), date: todayKey(), kg });
    if (mine.length === 0) setMyActivities([]);
    updateProfile({ onboarded: true });
  };

  const footer = (label: string, onClick: () => void, disabled = false, skip?: () => void) => (
    <footer className="flow-footer onboarding-footer">
      {skip && (
        <button className="btn" onClick={skip}>
          Skip
        </button>
      )}
      <button className="btn btn-primary btn-block" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    </footer>
  );

  return (
    <div className="flow onboarding">
      <header className="flow-header">
        {depth > 1 ? (
          <button className="icon-btn" onClick={back} aria-label="Back">
            ‹
          </button>
        ) : (
          <span className="icon-btn" />
        )}
        <div className="onboarding-dots" aria-label={`Step ${order.indexOf(step) + 1} of ${order.length}`}>
          {order.map((s) => (
            <i key={s} className={order.indexOf(s) <= order.indexOf(step) ? "on" : ""} />
          ))}
        </div>
        <span className="icon-btn" />
      </header>

      <main className="flow-body">
        {step === "units" && (
          <>
            <h1 className="onboarding-title">Welcome to Dash</h1>
            <p className="hint">A few things so the numbers make sense. Everything can be changed later in Settings.</p>
            <h2 className="list-heading">Which units do you use?</h2>
            <UnitTiles
              value={profile.units}
              onChange={(units) => {
                updateProfile({ units });
                next();
              }}
            />
          </>
        )}

        {step === "body" && (
          <>
            <h1 className="onboarding-title">Your first weigh-in</h1>
            <div className="field">
              <span className="field-label">Weight today</span>
              <WeightInput kg={kg} units={profile.units} onChange={setKg} autoFocus />
            </div>
            <div className="field">
              <span className="field-label">Height</span>
              <HeightInput cm={profile.heightCm} units={profile.units} onChange={(heightCm) => updateProfile({ heightCm })} />
            </div>
            <SexField />
            <p className="hint">Together with your age these give your daily calorie budget, and your weight scales exercise burn.</p>
          </>
        )}

        {step === "age" && (
          <>
            <h1 className="onboarding-title">How old are you?</h1>
            <BirthdayInput value={profile.birthday} onChange={(birthday) => updateProfile({ birthday })} />
          </>
        )}

        {step === "activities" && (
          <>
            <h1 className="onboarding-title">What do you do?</h1>
            <ActivityCatalogue mine={mine} onToggle={toggleMyActivity} hint="Star the activities you do; they show up first when you log exercise." />
          </>
        )}

        {step === "done" && (
          <>
            <h1 className="onboarding-title">All set</h1>
            <ul className="summary-list">
              <li>
                <span>Units</span>
                <b>{profile.units === "metric" ? "Metric" : "Imperial"}</b>
              </li>
              <li>
                <span>Weight</span>
                <b>{kg ? formatWeight(kg, profile.units) : "Later"}</b>
              </li>
              <li>
                <span>Height</span>
                <b>{profile.heightCm ? formatHeight(profile.heightCm, profile.units) : "Later"}</b>
              </li>
              <li>
                <span>Age</span>
                <b>{profile.birthday ? ageOn(profile.birthday) : "Later"}</b>
              </li>
              <li>
                <span>Daily budget</span>
                <b>{targets.missing.length ? "Needs weight, height and age" : `${targets.kcal.toLocaleString()} kcal`}</b>
              </li>
              <li>
                <span>Activities</span>
                <b className="summary-icons">
                  {mine.length
                    ? mine
                        .map(activityById)
                        .filter((a) => !!a)
                        .map((a) => (
                          <span key={a!.id} title={a!.name} role="img" aria-label={a!.name}>
                            {a!.icon}
                          </span>
                        ))
                    : "Later"}
                </b>
              </li>
            </ul>
          </>
        )}
      </main>

      {step === "body" && footer("Next", next, !kg, next)}
      {step === "age" && footer("Next", next, !profile.birthday, next)}
      {step === "activities" && footer(mine.length ? "Next" : "Skip for now", next)}
      {step === "done" && footer("Start logging", finish)}
    </div>
  );
}

function UnitTiles({ value, onChange }: { value: UnitSystem; onChange: (u: UnitSystem) => void }) {
  return (
    <div className="unit-tiles">
      {(
        [
          ["metric", "Metric", "kg · cm · km"],
          ["imperial", "Imperial", "lb · ft · mi"],
        ] as const
      ).map(([u, label, sub]) => (
        <button key={u} className="tile" aria-pressed={value === u} onClick={() => onChange(u)}>
          <strong>{label}</strong>
          <small>{sub}</small>
        </button>
      ))}
    </div>
  );
}

export function WeighInsScreen({ onMenu, notify }: { onMenu: () => void; notify: Notify }) {
  const { close } = useSteps<"list">("list");
  const { units, heightCm, birthday } = useProfile();
  const adult = !birthday || ageOn(birthday) >= ADULT_AGE;
  const all = useWeighIns();
  const [kg, setKg] = useState<number>();
  const [date, setDate] = useState(todayKey);
  const [formKey, setFormKey] = useState(0);
  const newest = [...all].reverse();
  const latest = newest[0];
  const diff = (i: number) => (newest[i + 1] ? toDisplayWeight(newest[i].kg, units) - toDisplayWeight(newest[i + 1].kg, units) : undefined);
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(Math.round(n * 10) / 10)} ${weightUnit(units)}`;
  const change = trendChange(all, units);
  const bmi = latest && heightCm ? latest.kg / (heightCm / 100) ** 2 : undefined;

  const save = () => {
    if (!kg) return;
    const before = weighInsSnapshot();
    addWeighIn({ id: crypto.randomUUID(), date, kg });
    notify(`Weighed in ${formatWeight(kg, units)}`, () => restoreWeighIns(before));
    setKg(undefined);
    setFormKey((k) => k + 1);
    setDate(todayKey());
  };

  return (
    <FlowShell title="Weigh-ins" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      {latest && (
        <section className="weigh-latest">
          <div className="weigh-big">
            <strong>{toDisplayWeight(latest.kg, units)}</strong>
            <span>{weightUnit(units)}</span>
          </div>
          <div className="weigh-meta">
            <span>
              {latest.date === todayKey() ? "Today" : new Date(`${latest.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              {change && ` · ${signed(change.delta)} ${change.label}`}
            </span>
            {bmi && <BmiBadge bmi={bmi} withBand={adult} />}
          </div>
          <Trend weighIns={all} />
        </section>
      )}

      <section className="weigh-form">
        <h2 className="list-heading">Add a weigh-in</h2>
        <WeightInput key={`${formKey}-${units}`} kg={kg} units={units} onChange={setKg} />
        <label className="field">
          <span className="field-label">Day</span>
          <input className="text-input" type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value || todayKey())} />
        </label>
        {all.some((w) => w.date === date) && <p className="hint">Replaces the weigh-in already on that day.</p>}
        <button className="btn btn-primary btn-block" disabled={!kg} onClick={save}>
          Save
        </button>
      </section>

      {newest.length > 0 && (
        <>
          <h2 className="list-heading">History</h2>
          <ul className="list">
            {newest.map((w, i) => (
              <li key={w.id} className="weigh-row">
                <span className="weigh-date">{new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
                <b>{formatWeight(w.kg, units)}</b>
                <span className="weigh-diff">{diff(i) !== undefined ? signed(diff(i)!) : ""}</span>
                <button
                  className="icon-btn small"
                  aria-label="Delete weigh-in"
                  onClick={() => {
                    const before = weighInsSnapshot();
                    removeWeighIn(w.id);
                    notify("Deleted", () => restoreWeighIns(before));
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </FlowShell>
  );
}

export function SettingsScreen({ onMenu }: { onMenu: () => void }) {
  const { close } = useSteps<"list">("list");
  const profile = useProfile();
  return (
    <FlowShell title="Settings" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <div className="field">
        <span className="field-label">Units</span>
        <UnitTiles value={profile.units} onChange={(units) => updateProfile({ units })} />
      </div>
      <div className="field">
        <span className="field-label">Height</span>
        <HeightInput key={profile.units} cm={profile.heightCm} units={profile.units} onChange={(heightCm) => updateProfile({ heightCm })} />
      </div>
      <SexField />
      <div className="field">
        <span className="field-label">Metabolism multiplier</span>
        <p className="hint">
          Resting burn × this is what you burn on a day without logged exercise. It covers everything Dash doesn't log, like walking around and your
          build. Logged exercise is added on top.
        </p>
        <KnownMaintenance />
        {profile.calibratedFrom ? (
          <p className="calibrated">
            × {profile.metabolismMultiplier}, from holding weight on {profile.calibratedFrom.maintenanceKcal.toLocaleString()} kcal
            {profile.calibratedFrom.loggedExerciseKcal > 0 && ` minus ${profile.calibratedFrom.loggedExerciseKcal} kcal of logged exercise a day`}.
          </p>
        ) : null}
        <span className="field-label sub-label">Or start from your day</span>
        <div className="multiplier-presets">
          {multipliers.map((m) => (
            <button
              key={m.value}
              className="tile"
              aria-pressed={!profile.calibratedFrom && profile.metabolismMultiplier === m.value}
              onClick={() => correctPlan({ metabolismMultiplier: m.value, calibratedFrom: undefined })}
            >
              <strong>× {m.value}</strong>
              <small>{m.label}</small>
            </button>
          ))}
        </div>
        <label className="measure-def multiplier-custom">
          Or exactly ×
          <input
            inputMode="decimal"
            defaultValue={profile.metabolismMultiplier}
            key={profile.metabolismMultiplier}
            onBlur={(e) => {
              const n = Number(e.target.value.replace(",", "."));
              if (n >= 1 && n <= 2.5 && n !== profile.metabolismMultiplier) correctPlan({ metabolismMultiplier: n, calibratedFrom: undefined });
            }}
          />
        </label>
      </div>
      <div className="field">
        <span className="field-label">Age</span>
        <BirthdayInput value={profile.birthday} onChange={(birthday) => birthday && updateProfile({ birthday })} />
      </div>
      <div className="field">
        <span className="field-label">My day ends at</span>
        <div className="segmented small">
          {[0, 2, 3, 4, 5, 6].map((h) => (
            <button key={h} aria-selected={profile.dayEndsAt === h} onClick={() => updateProfile({ dayEndsAt: h })}>
              {h === 0 ? "Midnight" : `${h}:00`}
            </button>
          ))}
        </div>
        <p className="hint">For night owls: anything logged before this counts toward the day before, so a late snack lands on the evening it belongs to.</p>
      </div>

      <h2 className="list-heading">Your data</h2>
      <p className="hint">Everything stays on this device for now. Export a file to keep a backup or move to another device.</p>
      <div className="settings-links">
        <button className="link-btn" onClick={downloadExport}>
          Export data
        </button>
        <label className="link-btn file-link">
          Import data…
          <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
        {import.meta.env.DEV && <DevServerBackup />}
        <button
          className="link-btn"
          onClick={() => {
            updateProfile({ onboarded: false });
            close();
          }}
        >
          Replay onboarding
        </button>
      </div>
    </FlowShell>
  );
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
function BmiBadge({ bmi, withBand }: { bmi: number; withBand: boolean }) {
  const value = (Math.round(bmi * 10) / 10).toFixed(1);
  if (!withBand) return <span className="bmi badge-muted">BMI {value}</span>;
  const band = bmiBands.find((b) => bmi < b.below)!;
  return (
    <span className={`bmi bmi-${band.tone}`}>
      BMI {value} · {band.label}
    </span>
  );
}

const DAY = 86_400_000;
const dayMs = (key: string) => new Date(`${key}T12:00:00`).getTime();

/** The card summarises a stretch of time; the per-weigh-in changes live in the history. */
function trendChange(all: WeighIn[], units: UnitSystem) {
  const latest = all[all.length - 1];
  if (!latest || all.length < 2) return undefined;
  const cutoff = dayMs(latest.date) - 30 * DAY;
  const ref = [...all].reverse().find((w) => dayMs(w.date) <= cutoff) ?? all[0];
  if (ref === latest) return undefined;
  const label =
    dayMs(ref.date) <= cutoff ? "in 30 days" : `since ${new Date(`${ref.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  return { delta: toDisplayWeight(latest.kg, units) - toDisplayWeight(ref.kg, units), label };
}

/** The last 90 days as a bare line; the history below is its table view. */
function Trend({ weighIns }: { weighIns: WeighIn[] }) {
  const latest = weighIns[weighIns.length - 1];
  const points = weighIns.filter((w) => dayMs(w.date) >= dayMs(latest.date) - 90 * DAY);
  if (points.length < 2) return null;
  const W = 300;
  const H = 48;
  const pad = 5;
  const t0 = dayMs(points[0].date);
  const span = Math.max(dayMs(latest.date) - t0, DAY);
  const kgs = points.map((p) => p.kg);
  const lo = Math.min(...kgs);
  const range = Math.max(Math.max(...kgs) - lo, 1);
  const xy = points.map((p) => [pad + ((dayMs(p.date) - t0) / span) * (W - 2 * pad), pad + (1 - (p.kg - lo) / range) * (H - 2 * pad)] as const);
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className="weigh-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight over the last ${Math.round(span / DAY)} days`}>
      <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="4" style={{ fill: "var(--accent)", stroke: "var(--surface)" }} strokeWidth="2" />
    </svg>
  );
}

const multipliers = [
  { value: 1.2, label: "Desk day" },
  { value: 1.375, label: "Walk around some" },
  { value: 1.55, label: "On my feet all day" },
  { value: 1.725, label: "Physical job" },
];

function SexField() {
  const { sex } = useProfile();
  return (
    <div className="field">
      <span className="field-label">Sex</span>
      <div className="segmented small">
        {(
          [
            ["female", "Female"],
            ["male", "Male"],
            [undefined, "Prefer not to say"],
          ] as const
        ).map(([value, label]) => (
          <button key={label} aria-selected={sex === value} onClick={() => updateProfile({ sex: value })}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">Only used for the resting-burn formula, which differs by about 170 kcal; without it Dash uses the average.</p>
    </div>
  );
}

/** Average logged exercise burn per day over the last four weeks, or since logging started if that's sooner. */
function loggedExercisePerDay(entries: Entry[]) {
  const today = todayKey();
  const from = shiftDate(today, -27);
  const first = entries.reduce((min, e) => (e.when.date < min ? e.when.date : min), today);
  const start = first > from ? first : from;
  const days = Math.round((dayMs(today) - dayMs(start)) / DAY) + 1;
  const total = entries.filter((e) => e.kind === "exercise" && e.when.date >= start && e.when.date <= today).reduce((sum, e) => sum + (e.kind === "exercise" ? (e.kcalEstimate ?? 0) : 0), 0);
  return Math.round(total / days);
}

/**
 * People who already know what they hold weight on shouldn't have to guess a multiplier. Their
 * usual workouts are part of that intake, so the logged average comes off before dividing.
 */
function KnownMaintenance() {
  const profile = useProfile();
  const weighIns = useWeighIns();
  const logged = loggedExercisePerDay(useEntries());
  const [kcal, setKcal] = useState("");
  const [includesWorkouts, setIncludesWorkouts] = useState(true);
  const bmr = dailyTargets(profile, weighIns).calc?.bmr;
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
                  correctPlan({ metabolismMultiplier: multiplier, calibratedFrom: { maintenanceKcal: n, loggedExerciseKcal: subtract } });
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

function downloadExport() {
  const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dash-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(file: File) {
  if (!confirm("Replace everything on this device with this file?")) return;
  try {
    await importData(JSON.parse(await file.text()));
    location.reload();
  } catch {
    alert("That file isn't a Dash export.");
  }
}

const BACKUP_URL = "/__dash/backup";

/** Only exists on the dev server: one shared file on the dev machine, so the PC and phone can swap data. */
function DevServerBackup() {
  const [saved, setSaved] = useState<string | null>();
  const [status, setStatus] = useState("");

  const refresh = () =>
    fetch(BACKUP_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setSaved(b?.exportedAt ?? null))
      .catch(() => setSaved(null));

  useEffect(() => {
    refresh();
  }, []);

  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

  return (
    <div className="dev-backup">
      <button
        className="link-btn"
        onClick={async () => {
          if (saved && !confirm(`Overwrite the copy on the dev server from ${when(saved)}?`)) return;
          const res = await fetch(BACKUP_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exportData()) });
          setStatus(res.ok ? "Saved to the dev server." : "Saving failed.");
          refresh();
        }}
      >
        Save to dev server
      </button>
      <button
        className="link-btn"
        disabled={!saved}
        onClick={async () => {
          if (!confirm(`Replace everything on this device with the dev server copy from ${when(saved!)}?`)) return;
          try {
            await importData(await (await fetch(BACKUP_URL)).json());
            location.reload();
          } catch {
            setStatus("Loading failed.");
          }
        }}
      >
        Load from dev server
      </button>
      <p className="hint">{status || (saved ? `Dev server copy from ${when(saved)}.` : saved === null ? "No copy on the dev server yet." : "")} Last save wins; nothing is merged.</p>
    </div>
  );
}
