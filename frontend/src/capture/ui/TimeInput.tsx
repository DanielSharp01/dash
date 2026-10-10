import { useState } from "react";
import { pad, uses12h } from "../time";

const minutes = Array.from({ length: 60 }, (_, m) => m);

/**
 * Hour and minute pickers that follow the clock setting. The native time input can't: it
 * follows the browser's locale, so it offered AM/PM while the app showed 24-hour times.
 */
export function TimeInput({ value, onChange }: { value: string | undefined; onChange: (time: string) => void }) {
  const twelve = uses12h();
  const [hour, setHour] = useState(value ? Number(value.slice(0, 2)) : undefined);
  const [minute, setMinute] = useState(value ? Number(value.slice(3, 5)) : undefined);
  const [pm, setPm] = useState((hour ?? new Date().getHours()) >= 12);

  const set = (h: number | undefined, m: number | undefined) => {
    setHour(h);
    setMinute(m);
    if (h !== undefined && m !== undefined) onChange(`${pad(h)}:${pad(m)}`);
  };
  const pickHour = (shown: number) => set(twelve ? (shown % 12) + (pm ? 12 : 0) : shown, minute ?? 0);
  const pickMeridiem = (nextPm: boolean) => {
    setPm(nextPm);
    if (hour !== undefined) set((hour % 12) + (nextPm ? 12 : 0), minute ?? 0);
  };

  const hours = twelve ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 24 }, (_, h) => h);
  const shownHour = hour === undefined ? "" : twelve ? hour % 12 || 12 : hour;

  return (
    <div className="time-input">
      <select aria-label="Hour" autoFocus value={shownHour} onChange={(e) => pickHour(Number(e.target.value))}>
        {hour === undefined && <option value="">--</option>}
        {hours.map((h) => (
          <option key={h} value={h}>
            {twelve ? h : pad(h)}
          </option>
        ))}
      </select>
      <span aria-hidden>:</span>
      <select aria-label="Minute" value={minute ?? ""} onChange={(e) => set(hour, Number(e.target.value))}>
        {minute === undefined && <option value="">--</option>}
        {minutes.map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </select>
      {twelve && (
        <div className="segmented small time-meridiem">
          <button aria-selected={!pm} onClick={() => pickMeridiem(false)}>
            am
          </button>
          <button aria-selected={pm} onClick={() => pickMeridiem(true)}>
            pm
          </button>
        </div>
      )}
    </div>
  );
}
