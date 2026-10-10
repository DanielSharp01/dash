import { useState } from "react";
import { dayParts, nowWhen, todayKey } from "../data/time";
import type { When } from "../data/types";

/** The day is fixed by the timeline the flow was opened from; only the time is picked here. */
export function WhenPicker({ value, onChange, onDone }: { value: When; onChange: (w: When) => void; onDone: () => void }) {
  const [exactOpen, setExactOpen] = useState(value.kind === "exact");
  const isToday = value.date === todayKey();
  const selectedPart = value.kind === "part" ? value.part : undefined;

  const pick = (w: When) => {
    onChange(w);
    onDone();
  };

  return (
    <div className="when">
      <div className="tile-grid">
        {isToday && (
          <button className="tile tile-wide" aria-pressed={value.kind === "now"} onClick={() => pick(nowWhen())}>
            <span className="tile-icon">⚡</span>
            <span className="tile-label">Now</span>
          </button>
        )}
        {dayParts.map((p) => (
          <button
            key={p.part}
            className="tile"
            aria-pressed={selectedPart === p.part}
            onClick={() => pick({ date: value.date, kind: "part", part: p.part })}
          >
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
