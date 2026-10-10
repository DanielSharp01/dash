import { useState } from "react";
import { type IconGroup, iconGroups, type LabelSource, searchIcons, sourceLabels } from "@dash/core";
import { Sheet } from "./Sheet";

/** The current icon as one control; the full set only opens on demand. */
export function IconField({ value, fallback, groups, onChange }: { value?: string; fallback: string; groups: IconGroup[]; onChange: (icon?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = searchIcons(query, groups);

  return (
    <>
      <button className="icon-field" onClick={() => setOpen(true)} aria-label="Change icon">
        <span>{value ?? fallback}</span>
        <small>{value ? "Change" : "Auto"}</small>
      </button>
      {open && (
        <Sheet title="Icon" onClose={() => setOpen(false)}>
          <div className="search-bar in-sheet">
            <input type="search" placeholder="Search icons" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {value && (
            <button
              className="link-btn"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              Pick automatically from the name
            </button>
          )}
          {(query ? [{ label: "Matches", icons: results }] : groups.map((g) => iconGroups[g])).map((g) => (
            <section key={g.label}>
              <h3 className="list-heading">{g.label}</h3>
              <div className="icon-grid">
                {g.icons.map((d) => (
                  <button
                    key={d.icon + d.names[0]}
                    className="icon-choice"
                    aria-pressed={value === d.icon}
                    title={d.names[0]}
                    onClick={() => {
                      onChange(d.icon);
                      setOpen(false);
                    }}
                  >
                    {d.icon}
                  </button>
                ))}
              </div>
            </section>
          ))}
          {query && results.length === 0 && <p className="hint">No icon matches “{query}”.</p>}
        </Sheet>
      )}
    </>
  );
}

const sourceHints: Record<LabelSource, string> = {
  package: "Read off the package in your hand",
  database: "Looked up by barcode",
  reference: "A food composition table, for things without a package",
  typed: "Your own numbers",
};

export function SourceField({ value, onChange }: { value: LabelSource; onChange: (s: LabelSource) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="value-chip" onClick={() => setOpen(true)}>
        <small>Source</small> {sourceLabels[value]} ▾
      </button>
      {open && (
        <Sheet title="Where are these values from?" onClose={() => setOpen(false)}>
          {(Object.keys(sourceLabels) as LabelSource[]).map((s) => (
            <button
              key={s}
              className={`row ${value === s ? "row-selected" : ""}`}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
            >
              <span className="row-main">
                <span className="row-title">{sourceLabels[s]}</span>
                <span className="row-sub">{sourceHints[s]}</span>
              </span>
              {value === s && <span className="row-check">✓</span>}
            </button>
          ))}
        </Sheet>
      )}
    </>
  );
}
