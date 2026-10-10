import { useState } from "react";
import { shiftDate, type When } from "@dash/core";
import { dayParts, nowWhen, todayKey, withDate } from "../time";

/** Any day can be picked, with yesterday one tap away for the morning-after case. */
export function WhenPicker({ value, onChange, onDone }: { value: When; onChange: (w: When) => void; onDone: () => void }) {
  const [exactOpen, setExactOpen] = useState(value.kind === "exact");
  const today = todayKey();
  const yesterday = shiftDate(today, -1);
  const isToday = value.date === today;
  const selectedPart = value.kind === "part" ? value.part : undefined;

  const pick = (w: When) => {
    onChange(w);
    onDone();
  };
  const setDate = (date: string) => onChange(date === today && value.kind === "now" ? nowWhen() : withDate(value, date));

  return (
    <div className="when">
      <div className="segmented">
        <button aria-selected={isToday} onClick={() => setDate(today)}>
          Today
        </button>
        <button aria-selected={value.date === yesterday} onClick={() => setDate(yesterday)}>
          Yesterday
        </button>
        <label className="date-choice" aria-selected={!isToday && value.date !== yesterday}>
          {!isToday && value.date !== yesterday ? new Date(`${value.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "Other day"}
          <input type="date" max={today} value={value.date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </div>

      <div className="tile-grid">
        {isToday && (
          <button className="tile tile-wide" aria-pressed={value.kind === "now"} onClick={() => pick(nowWhen())}>
            <span className="tile-icon">⚡</span>
            <span className="tile-label">Now</span>
          </button>
        )}
        {dayParts.map((p) => (
          <button key={p.part} className="tile" aria-pressed={selectedPart === p.part} onClick={() => pick({ date: value.date, kind: "part", part: p.part })}>
            <span className="tile-icon">{p.icon}</span>
            <span className="tile-label">{p.label}</span>
            <span className="tile-sub">{p.range}</span>
          </button>
        ))}
        <button className="tile" aria-pressed={value.kind === "day"} onClick={() => pick({ date: value.date, kind: "day" })}>
          <span className="tile-icon">🤷</span>
          <span className="tile-label">Not sure</span>
          <span className="tile-sub">sometime that day</span>
        </button>
      </div>

      {exactOpen ? (
        <div className="exact-time">
          <input
            type="time"
            autoFocus
            value={value.kind === "exact" || value.kind === "now" ? value.time : ""}
            onChange={(e) => e.target.value && onChange({ date: value.date, kind: "exact", time: e.target.value })}
          />
          <button className="btn" disabled={value.kind !== "exact"} onClick={onDone}>
            Use this time
          </button>
        </div>
      ) : (
        <button className="link-btn" onClick={() => setExactOpen(true)}>
          🕐 Set an exact time
        </button>
      )}
    </div>
  );
}
