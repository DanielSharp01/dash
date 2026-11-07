import { type KeyboardEvent, useRef } from "react";
import { todayKey } from "../time";

/** A card that acts as a button but can hold a date button, which a real <button> can't contain. */
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
 * A date shown as a button that opens the native picker. It sits inside cards that save on tap,
 * so its own taps stop there instead of reaching the card.
 */
export function DateButton({ prefix, value, min, max, onChange }: { prefix: string; value: string; min?: string; max?: string; onChange: (date: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const sameYear = value.slice(0, 4) === todayKey().slice(0, 4);
  const shown = value === todayKey() ? "today" : new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });

  return (
    <span className="date-btn" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button type="button" className="value-btn" onClick={() => input.current?.showPicker()}>
        {prefix} {shown} ▾
      </button>
      <input ref={input} type="date" tabIndex={-1} aria-hidden value={value} min={min} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </span>
  );
}
