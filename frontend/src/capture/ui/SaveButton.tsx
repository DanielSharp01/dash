/**
 * The primary save. A note it carries sits in an outlined box joined to its top, so it reads as part
 * of the choice; when the server would refuse the save, the button is disabled with the reasons inside it.
 */
export function SaveButton({ label, note, refusals = [], disabled, onClick }: { label: string; note?: string; refusals?: string[]; disabled?: boolean; onClick: () => void }) {
  if (refusals.length)
    return (
      <button className="btn btn-block save-refused" disabled>
        <span>{label}</span>
        {refusals.map((r) => (
          <small key={r}>✕ {r}</small>
        ))}
      </button>
    );
  if (note)
    return (
      <div className="save-block">
        <p className="save-note">{note}</p>
        <button className="btn btn-primary btn-block" disabled={disabled} onClick={onClick}>
          {label}
        </button>
      </div>
    );
  return (
    <button className="btn btn-primary btn-block" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}
