/**
 * The publish button with its reasons inside it, so they read as part of the choice. Blockers
 * are advice and publishing still works; refusals are what the server would turn down anyway,
 * so the button is disabled.
 */
export function PublishButton({
  blockers = [],
  refusals = [],
  label,
  disabled,
  onClick,
}: {
  blockers?: string[];
  refusals?: string[];
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (refusals.length)
    return (
      <button className="btn btn-block publish-refused" disabled>
        <span>{label}</span>
        {refusals.map((r) => (
          <small key={r}>✕ {r}</small>
        ))}
      </button>
    );
  if (!blockers.length)
    return (
      <button className="btn btn-primary btn-block" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    );
  return (
    <button className="btn btn-block publish-warn" disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      {blockers.map((b) => (
        <small key={b}>⚠ {b}</small>
      ))}
    </button>
  );
}
