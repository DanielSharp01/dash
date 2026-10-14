/**
 * The publish button with why it isn't the suggestion attached on top, so the reasons read as
 * part of the choice. Publishing still works below the bar.
 */
export function PublishButton({ blockers, label, disabled, onClick }: { blockers: string[]; label: string; disabled?: boolean; onClick: () => void }) {
  if (!blockers.length)
    return (
      <button className="btn btn-primary btn-block" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    );
  return (
    <div className="publish-block">
      <div className="publish-note" role="note">
        <strong>⚠ Not ready to share</strong>
        {blockers.map((b) => (
          <span key={b}>{b}</span>
        ))}
      </div>
      <button className="btn btn-block" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    </div>
  );
}
