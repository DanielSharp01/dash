/**
 * The publish button with why it isn't the suggestion inside it, so the reasons read as part of
 * the choice. Publishing still works below the bar.
 */
export function PublishButton({ blockers, label, disabled, onClick }: { blockers: string[]; label: string; disabled?: boolean; onClick: () => void }) {
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
