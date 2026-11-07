import type { ReactNode } from "react";

/** A question a page, centred, so answering feels like being asked rather than filling in a form. */
export function Question({ title, children, lead, hint }: { title: string; children: ReactNode; lead?: string[]; hint?: string[] }) {
  return (
    <section className="question">
      <h2>{title}</h2>
      {lead && <Sentences lines={lead} />}
      {children}
      {hint && <Sentences lines={hint} />}
    </section>
  );
}

/** A sentence a line reads easier than one wrapped paragraph on a phone. */
function Sentences({ lines }: { lines: string[] }) {
  return (
    <div className="question-hint">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

export type Choice<T> = { value: T; label: string; detail?: string; tone?: "protein" | "fat" };

/** Answers stacked full width, big enough to tap without aiming. */
export function Choices<T>({ options, selected, onPick }: { options: Choice<T>[]; selected?: T | null; onPick: (value: T) => void }) {
  return (
    <div className="choice-list">
      {options.map((o) => (
        <button key={o.label} className={o.tone ? `choice tone-${o.tone}` : "choice"} aria-pressed={selected === o.value} onClick={() => onPick(o.value)}>
          {o.label}
          {o.detail && <small>{o.detail}</small>}
        </button>
      ))}
    </div>
  );
}
