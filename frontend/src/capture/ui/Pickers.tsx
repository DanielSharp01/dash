import { useState } from "react";
import { type IconGroup, iconGroups, type LabelOrigin, originLabels, type Provenance, searchIcons } from "@dash/core";
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

type Choice = { origin?: LabelOrigin; title: string; hint: string };

const choices: Choice[] = [
  { title: "The package", hint: "Read off the package, or filled in from its barcode" },
  { origin: "usda", title: originLabels.usda, hint: "Imported from USDA's food composition table" },
  { origin: "ciqual", title: originLabels.ciqual, hint: "Imported from the Ciqual food composition table" },
  { origin: "online", title: originLabels.online, hint: "The maker's site or a menu" },
  { origin: "estimate", title: "Your estimate", hint: "Your own numbers, worked out or guessed" },
];

/** A barcode prefill is the package's own values, so it shows as the package. */
const fromPackage = (origin?: LabelOrigin) => origin === undefined || origin === "open-food-facts";
const isCurrent = (c: Choice, value: Provenance) => (c.origin === undefined ? fromPackage(value.origin) : c.origin === value.origin);

function choose(current: Provenance, c: Choice): Provenance {
  if (isCurrent(c, current)) return c.origin === undefined ? { ...current, verified: true } : current;
  return { verified: c.origin === undefined || c.origin === "online", ...(c.origin ? { origin: c.origin } : {}) };
}

/**
 * USDA and Ciqual are only offered while one of them filled the label in; picking them by hand would
 * claim an import that never happened. "The package" needs what every package shows: kcal, protein,
 * carbs and fat.
 */
export function ProvenanceField({ value, onChange, complete }: { value: Provenance; onChange: (p: Provenance) => void; complete: boolean }) {
  const [open, setOpen] = useState(false);
  const imported: (LabelOrigin | undefined)[] = ["usda", "ciqual"];
  const shown = choices.filter((c) => !imported.includes(c.origin) || value.origin === c.origin);
  return (
    <>
      <button className="value-btn" onClick={() => setOpen(true)}>
        <small>Source</small> {choices.find((c) => isCurrent(c, value))?.title} ▾
      </button>
      {value.origin === "online" && (
        <input
          className="text-input"
          type="url"
          placeholder="Where you found it (link)"
          value={value.url ?? ""}
          onChange={(e) => onChange({ verified: true, origin: "online", ...(e.target.value.trim() ? { url: e.target.value.trim() } : {}) })}
          aria-label="Link to where the values were found"
        />
      )}
      {open && (
        <Sheet title="Where are these values from?" onClose={() => setOpen(false)}>
          {shown.map((c) => {
            const needsLabel = c.origin === undefined && !complete && !fromPackage(value.origin);
            return (
              <button
                key={c.origin ?? "package"}
                className={`row ${isCurrent(c, value) ? "row-selected" : ""}`}
                disabled={needsLabel}
                onClick={() => {
                  onChange(choose(value, c));
                  setOpen(false);
                }}
              >
                <span className="row-main">
                  <span className="row-title">{c.title}</span>
                  <span className="row-sub">{needsLabel ? "Fill in kcal, protein, carbs and fat first" : c.hint}</span>
                </span>
                {isCurrent(c, value) && <span className="row-check">✓</span>}
              </button>
            );
          })}
        </Sheet>
      )}
    </>
  );
}
