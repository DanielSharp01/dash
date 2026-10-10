import { type KeyboardEvent, useRef } from "react";
import { todayKey } from "../time";

/** A card that acts as a button but can hold the chip, which a real <button> can't contain. */
export const tapCard = (onTap: () => void, disabled = false) => ({
  role: "button",
  tabIndex: disabled ? -1 : 0,
  "aria-disabled": disabled,
  onClick: () => !disabled && onTap(),
  onKeyDown: (e: KeyboardEvent) => {
    if (disabled || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onTap();
  },
});

/**
 * A date shown as a chip that opens the native picker. It sits inside cards that save on tap,
 * so its own taps stop there instead of reaching the card.
 */
export function DateChip({ prefix, value, min, max, onChange }: { prefix: string; value: string; min?: string; max?: string; onChange: (date: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const shown = value === todayKey() ? "today" : new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <span className="date-chip" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button type="button" className="value-chip" onClick={() => input.current?.showPicker()}>
        {prefix} {shown} ▾
      </button>
      <input ref={input} type="date" tabIndex={-1} aria-hidden value={value} min={min} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </span>
  );
}
