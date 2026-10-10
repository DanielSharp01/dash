import { useState } from "react";
import type { Amount } from "@dash/core";
import { NumberInput } from "./NumberInput";

const isBulk = (unit?: string) => unit === "g" || unit === "ml";
const isOunce = (unit?: string) => unit === "oz" || unit === "fl oz";

/** Switching unit starts from a typical amount of it, since 1 g or 100 bars are never meant. */
const startFor = (unit: string) => (isBulk(unit) ? 100 : isOunce(unit) ? 4 : 1);

/**
 * Quick buttons and a typed value. With allowOther, any word can be the unit ("bowl"), which
 * an unsure item keeps as a serving waiting for a size.
 */
export function AmountInput({ amount, units, onChange, allowOther = false, hints }: { amount: Amount; units: string[]; onChange: (a: Amount) => void; allowOther?: boolean; hints?: Record<string, string> }) {
  const [other, setOther] = useState(amount.unit && !units.includes(amount.unit) ? amount.unit : "");
  const [otherOpen, setOtherOpen] = useState(!!other);
  const quick = isBulk(amount.unit) ? [50, 100, 150, 200, 250, 330] : isOunce(amount.unit) ? [1, 2, 4, 8, 12, 16] : [0.5, 1, 1.5, 2, 3];
  const step = isBulk(amount.unit) ? 10 : isOunce(amount.unit) ? 1 : 0.5;
  const set = (value?: number) => onChange({ ...amount, value });
  const shownUnits = amount.unit && !units.includes(amount.unit) && !otherOpen ? [amount.unit, ...units] : units;

  return (
    <div className="amount">
      <div className="amount-display">
        <button className="round-btn" onClick={() => set(Math.max(0, (amount.value ?? 0) - step))} aria-label="Less">
          −
        </button>
        <span className="amount-field">
          <NumberInput className="amount-value" value={amount.value} placeholder="?" onChange={set} aria-label="Amount" />
          <span className="amount-unit">{amount.unit}</span>
        </span>
        <button className="round-btn" onClick={() => set((amount.value ?? 0) + step)} aria-label="More">
          +
        </button>
      </div>
      <div className="chip-row center">
        {quick.map((n) => (
          <button key={n} className="chip chip-ghost" aria-pressed={amount.value === n} onClick={() => set(n)}>
            {n === 0.5 ? "½" : n === 1.5 ? "1½" : n}
          </button>
        ))}
      </div>
      <div className="chip-row center" role="radiogroup" aria-label="Unit">
        {shownUnits.map((u) => (
          <button
            key={u}
            role="radio"
            aria-checked={amount.unit === u}
            className="chip"
            onClick={() => {
              setOtherOpen(false);
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
    </div>
  );
}
