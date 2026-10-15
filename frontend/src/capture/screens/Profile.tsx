import { useState } from "react";
import { ageOn, dailyTargets, genericSourceOf, type Entry, formatWeight, type Plan, planAt, type PlanVersion, type Pot, shiftDate, toDisplayWeight, type UnitSystem, type WeighIn, weightUnit } from "@dash/core";
import { useEntriesBetween } from "../../queries/entries.queries";
import { savePlan, saveProfile, useMe, useProfile } from "../../queries/me.queries";
import { addPot, removePot } from "../../queries/pots.queries";
import { addWeighIn, removeWeighIn, useWeighIns } from "../../queries/weighIns.queries";
import { ADULT_AGE } from "../body";
import { formatHour, todayKey, uses12h } from "../time";
import { BirthdayInput, HeightInput, WeightInput } from "../ui/BodyInputs";
import { FlowShell } from "../ui/FlowShell";
import { notify } from "../ui/notify";
import { NumberInput } from "../ui/NumberInput";
import { TrashIcon } from "../ui/TrashIcon";
import { useSteps } from "../ui/useSteps";

/** For settings that describe the body rather than the goal, like calibrating the multiplier. */
const correctPlan = (versions: PlanVersion[], patch: Partial<Plan>) => void savePlan({ ...planAt(versions), ...patch }, "fix");

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

export function WeighInsScreen({ onMenu }: { onMenu: () => void }) {
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
    const added = { id: crypto.randomUUID(), date, kg };
    const replaced = all.find((w) => w.date === date);
    void addWeighIn(added);
    notify(`Weighed in ${formatWeight(kg, units)}`, () => {
      void removeWeighIn(added.id);
      // The server dropped the one it replaced, so it comes back as a new weigh-in.
      if (replaced) void addWeighIn({ ...replaced, id: crypto.randomUUID() });
    });
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
                    void removeWeighIn(w.id);
                    notify("Deleted", () => void addWeighIn({ ...w, id: crypto.randomUUID() }));
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
  const { user, profile, plan, pots } = useMe();
  const current = planAt(plan.versions);
  const updateProfile = (patch: Parameters<typeof saveProfile>[0]) => void saveProfile(patch);
  return (
    <FlowShell title="Settings" canGoBack={false} onBack={close} onClose={close} onMenu={onMenu}>
      <section className="settings-group">
        <h2 className="list-heading">About you</h2>
        <p className="hint">Weight, height and age give your daily budget. Your weight comes from weigh-ins.</p>
        <div className="field">
          <span className="field-label">Units</span>
          <UnitTiles value={profile.units} onChange={(units) => updateProfile({ units })} />
        </div>
        <div className="field">
          <span className="field-label">Height</span>
          <HeightInput key={profile.units} cm={profile.heightCm} units={profile.units} onChange={(heightCm) => updateProfile({ heightCm })} />
        </div>
        <div className="field">
          <span className="field-label">Age</span>
          <BirthdayInput value={profile.birthday} onChange={(birthday) => birthday && updateProfile({ birthday })} />
        </div>
        <SexField sex={profile.sex} onChange={(sex) => updateProfile({ sex })} />
      </section>

      <section className="settings-group">
        <h2 className="list-heading">Your day</h2>
        <div className="field">
          <span className="field-label">My day ends at {profile.dayEndsAt === 0 ? "midnight" : formatHour(profile.dayEndsAt)}</span>
          {/* Bare hours: with "am" or ":00" on each, six buttons are wider than a phone. */}
          <div className="segmented small">
            {[0, 2, 3, 4, 5, 6].map((h) => (
              <button key={h} aria-label={h === 0 ? "Midnight" : formatHour(h)} aria-selected={profile.dayEndsAt === h} onClick={() => updateProfile({ dayEndsAt: h })}>
                {h === 0 ? "Midnight" : h}
              </button>
            ))}
          </div>
          <p className="hint">Anything logged before this counts toward the day before, so a late snack lands on the evening it belongs to.</p>
        </div>
        <div className="field">
          <span className="field-label">Clock</span>
          <div className="segmented small">
            <button aria-selected={!uses12h()} onClick={() => updateProfile({ clock: "24h" })}>
              24-hour
            </button>
            <button aria-selected={uses12h()} onClick={() => updateProfile({ clock: "12h" })}>
              12-hour
            </button>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Day recap</span>
          <div className="segmented small">
            <button aria-selected={profile.autoRecap} onClick={() => updateProfile({ autoRecap: true })}>
              Plays itself
            </button>
            <button aria-selected={!profile.autoRecap} onClick={() => updateProfile({ autoRecap: false })}>
              From the strip
            </button>
          </div>
          <p className="hint">Once a day is over, its recap plays the next time you open Dash. Otherwise it waits in the strip under the day's summary.</p>
        </div>
        <div className="field">
          <span className="field-label">Generic foods</span>
          <div className="segmented small">
            <button aria-selected={genericSourceOf(profile) === "usda"} onClick={() => updateProfile({ genericSource: "usda" })}>
              USDA (US)
            </button>
            <button aria-selected={genericSourceOf(profile) === "ciqual"} onClick={() => updateProfile({ genericSource: "ciqual" })}>
              Ciqual (Europe)
            </button>
          </div>
          <p className="hint">
            Values for foods like a banana or rolled oats differ by region, so search shows one table.{!profile.genericSource && " Picked from your time zone until you choose."}
          </p>
        </div>
      </section>

      <section className="settings-group">
        <h2 className="list-heading">Metabolism</h2>
        <p className="hint">
          Resting burn × this multiplier is what you burn on a day without logged exercise. It covers everything Dash doesn't log, like walking around
          and your build. Logged exercise is added on top.
        </p>
        <KnownMaintenance />
        {current.calibratedFrom ? (
          <p className="calibrated">
            × {current.metabolismMultiplier}, from holding weight on {current.calibratedFrom.maintenanceKcal.toLocaleString()} kcal
            {current.calibratedFrom.loggedExerciseKcal > 0 && ` minus ${current.calibratedFrom.loggedExerciseKcal} kcal of logged exercise a day`}.
          </p>
        ) : null}
        <span className="field-label sub-label">Or start from your day</span>
        <div className="multiplier-presets">
          {multipliers.map((m) => (
            <button
              key={m.value}
              className="tile"
              aria-pressed={!current.calibratedFrom && current.metabolismMultiplier === m.value}
              onClick={() => correctPlan(plan.versions, { metabolismMultiplier: m.value, calibratedFrom: undefined })}
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
            defaultValue={current.metabolismMultiplier}
            key={current.metabolismMultiplier}
            onBlur={(e) => {
              const n = Number(e.target.value.replace(",", "."));
              if (n >= 1 && n <= 2.5 && n !== current.metabolismMultiplier) correctPlan(plan.versions, { metabolismMultiplier: n, calibratedFrom: undefined });
            }}
          />
        </label>
      </section>

      <section className="settings-group">
        <h2 className="list-heading">Cooking</h2>
        <Pots pots={pots} />
      </section>

      <section className="settings-group">
        <h2 className="list-heading">Account</h2>
        <p className="hint">Signed in as {user.email ?? user.name ?? "you"}.</p>
        <div className="settings-links">
          <a className="link-btn" href="/auth/logout">
            Sign out
          </a>
        </div>
      </section>
    </FlowShell>
  );
}

/** Weighed once while empty, so a finished dish can be weighed without tipping it out. */
function Pots({ pots }: { pots: Pot[] }) {
  const [name, setName] = useState("");
  const [grams, setGrams] = useState<number>();
  return (
    <div className="field">
      <span className="field-label">Pots and pans</span>
      <p className="hint">Their empty weight comes off when you weigh a finished dish in them.</p>
      <ul className="list">
        {pots.map((p) => (
          <li key={p.id} className="weigh-row">
            <span className="weigh-date">{p.name}</span>
            <b>{p.grams.toLocaleString()} g</b>
            <button className="icon-btn small trash-btn" aria-label={`Remove ${p.name}`} onClick={() => void removePot(p)}>
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
      <div className="serving-row">
        <input className="text-input" placeholder="e.g. Big pot" value={name} onChange={(e) => setName(e.target.value)} />
        <NumberInput integer className="text-input serving-size" placeholder="g" value={grams} onChange={setGrams} />
        <button
          className="btn btn-small"
          disabled={!name.trim() || !grams}
          onClick={() => {
            void addPot({ id: crypto.randomUUID(), name: name.trim(), grams: grams! });
            setName("");
            setGrams(undefined);
          }}
        >
          Add
        </button>
      </div>
    </div>
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

function SexField({ sex, onChange }: { sex?: "male" | "female"; onChange: (sex: "male" | "female" | undefined) => void }) {
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
          <button key={label} aria-selected={sex === value} onClick={() => onChange(value)}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">Only used for the resting-burn formula, which differs by about 170 kcal; without it Dash uses the average.</p>
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
function KnownMaintenance() {
  const { profile, plan } = useMe();
  const weighIns = useWeighIns();
  const today = todayKey();
  const from = shiftDate(today, -27);
  const logged = loggedExercisePerDay(useEntriesBetween(from, today).data ?? [], from);
  const [kcal, setKcal] = useState("");
  const [includesWorkouts, setIncludesWorkouts] = useState(true);
  const bmr = dailyTargets(profile, plan.versions, weighIns).calc?.bmr;
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
                  correctPlan(plan.versions, { metabolismMultiplier: multiplier, calibratedFrom: { maintenanceKcal: n, loggedExerciseKcal: subtract } });
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
