import { useState } from "react";

export const foodIcons = ["🍎", "🍌", "🍊", "🍓", "🥑", "🥕", "🥦", "🥔", "🍅", "🥗", "🍞", "🥐", "🧀", "🥚", "🍗", "🥩", "🐟", "🍕", "🍔", "🌮", "🥪", "🍝", "🍜", "🍲", "🍛", "🍣", "🍚", "🥣", "💧", "🥛", "☕", "🧃", "🥤", "🍺", "🍷", "🍫", "🍪", "🍰", "🍦", "🥜", "🫒", "🧈", "🍯", "🥫"];

export const activityIcons = ["🏃", "🚴", "🏊", "🏋️", "🧘", "🥾", "⚽", "🎾", "🏓", "🥊", "🛶", "🏄", "🧗", "💃", "⛹️", "🤾", "🏒", "🛹", "🐕", "🧹"];

/** A grid of common picks plus a field for any other emoji the phone keyboard offers. */
export function IconPicker({ value, options, onChange }: { value: string; options: string[]; onChange: (icon: string) => void }) {
  const [custom, setCustom] = useState(options.includes(value) ? "" : value);
  return (
    <>
      <div className="icon-grid" role="radiogroup" aria-label="Icon">
        {options.map((i) => (
          <button key={i} role="radio" aria-checked={value === i} className="icon-choice" onClick={() => onChange(i)}>
            {i}
          </button>
        ))}
      </div>
      <label className="measure-def icon-custom">
        Or any emoji
        <input
          value={custom}
          placeholder="🙂"
          aria-label="Custom emoji"
          onChange={(e) => {
            // Keep only the last emoji typed, so the field always holds a single icon.
            const last = [...new Intl.Segmenter().segment(e.target.value.trim())].pop()?.segment ?? "";
            setCustom(last);
            if (last) onChange(last);
          }}
        />
      </label>
    </>
  );
}
