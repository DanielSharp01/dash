import { useState } from "react";
import { ADULT_AGE, ageOn, birthdayFrom } from "../data/profile";
import { fromDisplayWeight, fromFeet, toDisplayWeight, toFeet, type UnitSystem, weightUnit } from "../data/units";

const parse = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? undefined : n;
};

/** Keeps the typed text so converting units doesn't fight the person mid-edit. */
export function WeightInput({ kg, units, onChange, autoFocus }: { kg?: number; units: UnitSystem; onChange: (kg?: number) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(kg === undefined ? "" : String(toDisplayWeight(kg, units)));
  return (
    <label className="kcal-field big-number">
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder="–"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parse(e.target.value);
          onChange(n === undefined ? undefined : fromDisplayWeight(n, units));
        }}
      />
      <span>{weightUnit(units)}</span>
    </label>
  );
}

export function HeightInput({ cm, units, onChange }: { cm?: number; units: UnitSystem; onChange: (cm?: number) => void }) {
  const feet = cm === undefined ? undefined : toFeet(cm);
  const [ft, setFt] = useState(feet ? String(feet.ft) : "");
  const [inch, setInch] = useState(feet ? String(feet.inch) : "");
  const [metric, setMetric] = useState(cm === undefined ? "" : String(Math.round(cm)));

  if (units === "metric")
    return (
      <label className="kcal-field">
        <input
          inputMode="numeric"
          placeholder="–"
          value={metric}
          onChange={(e) => {
            setMetric(e.target.value);
            onChange(parse(e.target.value));
          }}
        />
        <span>cm</span>
      </label>
    );

  const update = (f: string, i: string) => {
    const nf = parse(f);
    onChange(nf === undefined ? undefined : fromFeet(nf, parse(i) ?? 0));
  };
  return (
    <div className="height-imperial">
      <label className="kcal-field">
        <input
          inputMode="numeric"
          placeholder="–"
          value={ft}
          onChange={(e) => {
            setFt(e.target.value);
            update(e.target.value, inch);
          }}
        />
        <span>ft</span>
      </label>
      <label className="kcal-field">
        <input
          inputMode="numeric"
          placeholder="0"
          value={inch}
          onChange={(e) => {
            setInch(e.target.value);
            update(ft, e.target.value);
          }}
        />
        <span>in</span>
      </label>
    </div>
  );
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const daysIn = (month: number) => new Date(2000, month, 0).getDate();

/** "I'm 29, born on 4 March": the year is worked out, not picked from a long list. */
export function BirthdayInput({ value, onChange }: { value?: string; onChange: (birthday?: string) => void }) {
  const [, vm, vd] = value?.split("-").map(Number) ?? [];
  const [age, setAge] = useState(value ? String(ageOn(value)) : "");
  const [month, setMonth] = useState<number | undefined>(vm);
  const [day, setDay] = useState<number | undefined>(vd);

  const emit = (a: string, m?: number, d?: number) => {
    const n = parse(a);
    onChange(n !== undefined && n > 0 && n < 120 && m && d ? birthdayFrom(n, m, d) : undefined);
  };

  return (
    <div className="birthday">
      <div className="birthday-sentence">
        I'm
        <input
          inputMode="numeric"
          className="age-input"
          placeholder="?"
          value={age}
          aria-label="Age"
          onChange={(e) => {
            setAge(e.target.value);
            emit(e.target.value, month, day);
          }}
        />
        born on
        <strong>{month ? `${day ?? "…"} ${months[month - 1]}` : "…"}</strong>
      </div>
      <div className="month-grid" role="radiogroup" aria-label="Birth month">
        {months.map((m, i) => (
          <button
            key={m}
            role="radio"
            aria-checked={month === i + 1}
            className="chip"
            onClick={() => {
              const nextDay = day && day > daysIn(i + 1) ? undefined : day;
              setMonth(i + 1);
              setDay(nextDay);
              emit(age, i + 1, nextDay);
            }}
          >
            {m}
          </button>
        ))}
      </div>
      {month && (
        <div className="day-grid" role="radiogroup" aria-label="Birth day">
          {Array.from({ length: daysIn(month) }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={day === d}
              className="day-chip"
              onClick={() => {
                setDay(d);
                emit(age, month, d);
              }}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      {value && ageOn(value) < ADULT_AGE && (
        <div className="notice">
          <span>
            Dash is designed for adults. Under {ADULT_AGE} you may still be growing, so keep your height up to date, and BMI is shown without the adult
            categories. Talk to a doctor before dieting.
          </span>
        </div>
      )}
      {value && <p className="hint">Born {new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.</p>}
    </div>
  );
}
