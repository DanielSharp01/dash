import { useState } from "react";
import { checkableOrigins, type IconGroup, iconGroups, type LabelOrigin, originLabels, type Provenance, provenanceChips, searchIcons } from "@dash/core";
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
  { title: "The package", hint: "Read off the package in your hand" },
  { origin: "open-food-facts", title: originLabels["open-food-facts"], hint: "Filled in from a barcode scan" },
  { origin: "usda", title: originLabels.usda, hint: "Imported from USDA's food composition table" },
  { origin: "ciqual", title: originLabels.ciqual, hint: "Imported from the Ciqual food composition table" },
  { origin: "online", title: originLabels.online, hint: "A menu or the maker's site" },
  { origin: "estimate", title: "Your estimate", hint: "Your own numbers, worked out or guessed" },
];

/** Typed off the package counts as verified; reference tables and estimates have no package to check. */
function choose(current: Provenance, origin?: LabelOrigin): Provenance {
  if (origin === current.origin) return current;
  return { verified: origin === undefined, ...(origin ? { origin } : {}) };
}

/**
 * Open Food Facts, USDA and Ciqual are only offered while one of them filled the label in; picking
 * them by hand would claim a lookup or import that never happened. Values looked up by hand are
 * "found online".
 */
/**
 * "Read off the package" needs what every package shows: kcal, protein, carbs and fat. Until then
 * the package can't be the source and a prefill can't be marked as matching it.
 */
export function ProvenanceField({ value, onChange, complete }: { value: Provenance; onChange: (p: Provenance) => void; complete: boolean }) {
  const [open, setOpen] = useState(false);
  const filledIn: (LabelOrigin | undefined)[] = ["open-food-facts", "usda", "ciqual"];
  const shown = choices.filter((c) => !filledIn.includes(c.origin) || value.origin === c.origin);
  const checkable = checkableOrigins.includes(value.origin) && value.origin !== undefined;
  return (
    <>
      <button className="value-chip" onClick={() => setOpen(true)}>
        <small>Source</small> {provenanceChips(value).join(" · ")} ▾
      </button>
      {checkable && (
        <label className="check-line">
          <input type="checkbox" checked={value.verified} disabled={!complete && !value.verified} onChange={(e) => onChange({ ...value, verified: e.target.checked })} />
          Matches the package
        </label>
      )}
      {value.origin === "online" && (
        <input
          className="text-input"
          type="url"
          placeholder="Where you found it (link)"
          value={value.url ?? ""}
          onChange={(e) => onChange({ verified: false, origin: "online", ...(e.target.value.trim() ? { url: e.target.value.trim() } : {}) })}
          aria-label="Link to where the values were found"
        />
      )}
      {open && (
        <Sheet title="Where are these values from?" onClose={() => setOpen(false)}>
          {shown.map((c) => {
            const needsLabel = c.origin === undefined && !complete && value.origin !== undefined;
            return (
              <button
                key={c.origin ?? "package"}
                className={`row ${value.origin === c.origin ? "row-selected" : ""}`}
                disabled={needsLabel}
                onClick={() => {
                  onChange(choose(value, c.origin));
                  setOpen(false);
                }}
              >
                <span className="row-main">
                  <span className="row-title">{c.title}</span>
                  <span className="row-sub">{needsLabel ? "Fill in kcal, protein, carbs and fat first" : c.hint}</span>
                </span>
                {value.origin === c.origin && <span className="row-check">✓</span>}
              </button>
            );
          })}
        </Sheet>
      )}
    </>
  );
}
