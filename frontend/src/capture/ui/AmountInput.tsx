import { useState } from "react";
import { type Amount, autoStep, countOf, fineStepsFor, type QuickSize, quickSizesFor, round, unitDimension } from "@dash/core";
import { NumberInput } from "./NumberInput";

const isBulk = (unit?: string) => unit === "g" || unit === "ml";
const isOunce = (unit?: string) => unit === "oz" || unit === "fl oz";

/** Switching unit starts from a typical amount of it, since 1 g or 100 bars are never meant. */
const startFor = (unit: string) => (isBulk(unit) ? 100 : isOunce(unit) ? 4 : 1);

const counts = [1, 2, 4, 6, 8, 10];
const formatCount = (n: number) => (n === 0.5 ? "½" : n === 1.5 ? "1½" : String(n));

/** A quick size picked as the step, or a chosen fine step; unset follows the amount. */
type Step = { size: QuickSize } | { fine: number } | undefined;

/**
 * Quick buttons and a typed value. A measured unit's last tapped size is what − and + move by,
 * and tapping it again adds one more. With allowOther, any word can be the unit ("bowl"), which
 * an unsure item keeps as a serving waiting for a size.
 */
export function AmountInput({ amount, units, onChange, allowOther = false, hints }: { amount: Amount; units: string[]; onChange: (a: Amount) => void; allowOther?: boolean; hints?: Record<string, string> }) {
  const [other, setOther] = useState(amount.unit && !units.includes(amount.unit) ? amount.unit : "");
  const [otherOpen, setOtherOpen] = useState(!!other);
  const [step, setStep] = useState<Step>();
  const sizes = quickSizesFor(amount.unit);
  const fine = fineStepsFor(amount.unit);
  const value = amount.value ?? 0;
  const size = step && "size" in step ? step.size : undefined;
  const fineStep = step && "fine" in step ? step.fine : autoStep(fine, amount.value);
  const by = size?.value ?? fineStep;
  const times = size && countOf(size, amount.value);
  // A number without a unit can never be sized, however complete the item later gets.
  const set = (next?: number) => onChange({ ...amount, unit: amount.unit ?? units[0], value: next === undefined ? undefined : round(next, 2) });
  const shownUnits = amount.unit && !units.includes(amount.unit) && !otherOpen ? [amount.unit, ...units] : units;
  // Only a serving makes switching worth a row; g against oz alone isn't.
  const canSwitch = allowOther || !amount.unit || (shownUnits.length > 1 && shownUnits.some((u) => !unitDimension(u)));

  const tapSize = (s: QuickSize) => {
    set(size?.value === s.value ? value + s.value : s.value);
    setStep({ size: s });
  };

  return (
    <div className="amount">
      <div className="amount-display">
        <button className="round-btn" onClick={() => set(size ? Math.max(size.value, value - by) : Math.max(0, value - by))} aria-label={`Less by ${formatCount(by)}`}>
          −
        </button>
        <span className="amount-field">
          <NumberInput
            className="amount-value"
            value={amount.value}
            placeholder="?"
            onFocus={(e) => e.target.select()}
            onChange={(n) => {
              set(n);
              if (size) setStep(undefined);
            }}
            aria-label="Amount"
          />
          <span className="amount-unit">{amount.unit}</span>
        </span>
        <button className="round-btn" onClick={() => set(value + by)} aria-label={`More by ${formatCount(by)}`}>
          +
        </button>
      </div>
      {times && (
        <p className="amount-times">
          {times} × {size?.name}
        </p>
      )}
      <div className="chip-row center" role="radiogroup" aria-label="Step">
        {fine.map((n) => (
          <button key={n} role="radio" className="chip chip-ghost" aria-checked={!size && fineStep === n} onClick={() => setStep({ fine: n })}>
            ±{formatCount(n)}
            {amount.unit && <small> {amount.unit}</small>}
          </button>
        ))}
      </div>
      {sizes ? (
        sizes.map((row) => (
          <div key={row[0]!.value} className="chip-row center">
            {row.map((s) => (
              <button key={s.value} className={`chip chip-ghost ${s.name ? "chip-size" : ""}`} aria-pressed={size?.value === s.value} onClick={() => tapSize(s)}>
                <span>
                  {formatCount(s.value)}
                  <small> {amount.unit}</small>
                </span>
                {s.name && <small>{s.name}</small>}
              </button>
            ))}
          </div>
        ))
      ) : (
        <div className="chip-row center">
          {counts.map((n) => (
            <button key={n} className="chip chip-ghost" aria-pressed={amount.value === n} onClick={() => set(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      {canSwitch && (
        <div className="chip-row center" role="radiogroup" aria-label="Unit">
          {shownUnits.map((u) => (
            <button
              key={u}
              role="radio"
              aria-checked={amount.unit === u}
              className="chip"
              onClick={() => {
                setOtherOpen(false);
                if (amount.unit !== u) setStep(undefined);
                onChange({ unit: u, value: amount.unit === u ? amount.value : startFor(u) });
              }}
            >
              {u}
              {hints?.[u] && <small> {hints[u]}</small>}
            </button>
          ))}
          {allowOther &&
            (otherOpen ? (
              <input
                className="chip chip-input"
                autoFocus
                placeholder="bowl, pack…"
                value={other}
                onChange={(e) => {
                  setOther(e.target.value);
                  if (e.target.value.trim()) onChange({ value: amount.value ?? 1, unit: e.target.value.trim() });
                }}
              />
            ) : (
              <button className="chip chip-ghost" onClick={() => setOtherOpen(true)}>
                Other…
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
