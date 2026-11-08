import type { ReactNode } from "react";

/**
 * Public or Private on an item, combo or recipe. Public is final: a shared one stays shared, so
 * once it is, the control only says so and `children` offers the way out (a private copy).
 */
export function SharingControl({
  isPublic,
  shared = false,
  blockers = [],
  onChange,
  children,
}: {
  isPublic: boolean;
  shared?: boolean;
  blockers?: string[];
  onChange?: (isPublic: boolean) => void;
  children?: ReactNode;
}) {
  const hints = shared ? ["Shared items stay shared."] : isPublic ? ["Everyone can find and log it, without your name."] : blockers.length ? blockers : ["Only you see it."];
  return (
    <div className="field sharing">
      <span className="field-label">Sharing</span>
      <div className="segmented small" role="radiogroup" aria-label="Sharing">
        <button role="radio" aria-selected={!isPublic && !shared} disabled={shared} onClick={() => onChange?.(false)}>
          Private
        </button>
        <button role="radio" aria-selected={isPublic || shared} disabled={!shared && blockers.length > 0} onClick={() => onChange?.(true)}>
          Public
        </button>
      </div>
      {hints.map((h) => (
        <p key={h} className="hint">
          {h}
        </p>
      ))}
      {children}
    </div>
  );
}
