import { useState } from "react";
import { basisLabel, BEGINNING, energyImpossible, energyMismatch, type FoodUnit, type Label, mainNutrients, nutrientKeys, nutrientMeta, type Nutrients, estimated, offThePackage, type Provenance, provenanceOf } from "@dash/core";
import { NumberInput } from "./NumberInput";
import { ProvenanceField } from "./Pickers";

/** The label as it's being typed; the item's unit follows from the basis printed on the package. */
export interface LabelDraft {
  basis: "100g" | "100ml" | "serving";
  servingName: string;
  servingSize?: number;
  servingUnit: "g" | "ml";
  pieceCount?: number;
  pieceName: string;
  values: Nutrients;
  provenance: Provenance;
}

/** A new label is typed off the package unless the caller knows better. */
export function draftFrom(unit: FoodUnit | undefined, label: Label | undefined, fallback: Provenance = offThePackage): LabelDraft {
  const sized = unit === "g" || unit === "ml" ? unit : "g";
  return {
    basis: !label ? (unit === "ml" ? "100ml" : unit === "piece" ? "serving" : "100g") : label.per === "100" ? (unit === "ml" ? "100ml" : "100g") : "serving",
    servingName: label?.servingName ?? "",
    servingSize: label?.servingSize,
    servingUnit: sized,
    pieceCount: label?.servingPieces?.count,
    pieceName: label?.servingPieces?.name ?? "",
    values: label?.values ?? {},
    provenance: label ? provenanceOf(label) : fallback,
  };
}

/** A serving without a size means the food is counted in pieces. */
export function unitOf(d: LabelDraft): FoodUnit {
  if (d.basis === "100g") return "g";
  if (d.basis === "100ml") return "ml";
  return d.servingSize ? d.servingUnit : "piece";
}

export const hasValues = (d: LabelDraft) => Object.values(d.values).some((v) => v !== undefined);

/** What every package shows; a label without all of it can't have been read off one. */
export const basicsFilled = (d: LabelDraft) => (["kcal", "protein", "carbs", "fat"] as const).every((k) => d.values[k] !== undefined);

/**
 * The source as saved: "checked against the pack" only counts once the basics are filled in;
 * before that it's an estimate, or the unchecked prefill it came from.
 */
export function effectiveProvenance(d: LabelDraft): Provenance {
  if (!d.provenance.verified || basicsFilled(d)) return d.provenance;
  return d.provenance.origin ? { ...d.provenance, verified: false } : estimated;
}

/** Undefined while nothing is filled in, so a skipped label stays absent instead of all zeros. */
export function labelFrom(d: LabelDraft, from: string = BEGINNING): Label | undefined {
  if (!hasValues(d)) return undefined;
  const values = Object.fromEntries(Object.entries(d.values).filter(([, v]) => v !== undefined)) as Nutrients;
  const provenance = effectiveProvenance(d);
  if (d.basis !== "serving") return { from, per: "100", values, ...provenance };
  const servingPieces = d.pieceCount && d.pieceCount > 0 && d.pieceName.trim() ? { count: d.pieceCount, name: d.pieceName.trim() } : undefined;
  return { from, per: "serving", servingSize: d.servingSize || undefined, servingName: d.servingName.trim() || undefined, servingPieces, values, ...provenance };
}

export function LabelForm({ draft, onChange, autoFocus }: { draft: LabelDraft; onChange: (d: LabelDraft) => void; autoFocus?: boolean }) {
  const extra = nutrientKeys.filter((k) => !(mainNutrients as readonly string[]).includes(k));
  const [more, setMore] = useState(() => extra.some((k) => draft.values[k] !== undefined));
  const shown = nutrientKeys.filter((k) => more || (mainNutrients as readonly string[]).includes(k));
  const set = (patch: Partial<LabelDraft>) => onChange({ ...draft, ...patch });
  const unit = unitOf(draft);
  const mismatch = energyMismatch(draft.values);

  return (
    <div className="label-form">
      <div className="segmented small" role="radiogroup" aria-label="Values are">
        {(
          [
            ["100g", "Per 100 g"],
            ["100ml", "Per 100 ml"],
            ["serving", "Per serving"],
          ] as const
        ).map(([b, text]) => (
          <button key={b} role="radio" aria-selected={draft.basis === b} onClick={() => set({ basis: b })}>
            {text}
          </button>
        ))}
      </div>

      {draft.basis === "serving" && (
        <div className="serving-def">
          <input className="text-input" placeholder="bar, slice, cookie…" value={draft.servingName} onChange={(e) => set({ servingName: e.target.value })} aria-label="Serving name" />
          <NumberInput className="text-input serving-size" placeholder="size" value={draft.servingSize} onChange={(servingSize) => set({ servingSize })} aria-label="Serving size" />
          <div className="segmented small">
            {(["g", "ml"] as const).map((u) => (
              <button key={u} aria-selected={draft.servingUnit === u} onClick={() => set({ servingUnit: u })}>
                {u}
              </button>
            ))}
          </div>
        </div>
      )}
      {draft.basis === "serving" && (
        <div className="serving-pieces">
          <span>made of</span>
          <NumberInput className="text-input serving-size" placeholder="–" value={draft.pieceCount} onChange={(pieceCount) => set({ pieceCount })} aria-label="Pieces per serving" />
          <input className="text-input" placeholder="cookies, slices… (optional)" value={draft.pieceName} onChange={(e) => set({ pieceName: e.target.value })} aria-label="Piece name" />
        </div>
      )}
      {draft.basis === "serving" && (
        <p className="hint">
          {draft.pieceCount && draft.pieceName.trim() && draft.servingSize
            ? `So each is ${Math.round((draft.servingSize / draft.pieceCount) * 10) / 10} ${draft.servingUnit}, and you can log in ${draft.pieceName.trim()}.`
            : !draft.servingSize
              ? "No size on the package? Leave it empty and it's counted in pieces."
              : "If the serving is a number of pieces, like 2 cookies, add them to log by the piece."}
        </p>
      )}

      <div className="nutrition-label">
        <div className="nutrition-label-head">
          <b>Nutrition</b>
          <span>{basisLabel(labelFrom({ ...draft, values: { kcal: 0 } }) ?? { per: "100" }, unit)}</span>
        </div>
        {shown.map((k, i) => (
          <label key={k} className={`nutrition-row ${nutrientMeta[k].sub ? "sub" : ""}`}>
            <span>{nutrientMeta[k].label}</span>
            <NumberInput
              integer={k === "kcal"}
              autoFocus={autoFocus && i === 0}
              placeholder="–"
              value={draft.values[k]}
              onChange={(n) => set({ values: { ...draft.values, [k]: n } })}
            />
            <small>{nutrientMeta[k].unit}</small>
          </label>
        ))}
        <button className="nutrition-more" onClick={() => setMore(!more)}>
          {more ? "Fewer rows" : "Sugars, salt, caffeine…"}
        </button>
      </div>

      {mismatch !== undefined && (
        <p className="hint warn-hint">
          {energyImpossible(draft.values)
            ? `The macros alone are about ${mismatch} kcal, more than the ${draft.values.kcal} it says. A typo?`
            : `The macros add up to about ${mismatch} kcal, but it says ${draft.values.kcal}. A typo? Alcohol or lots of fibre can explain a gap.`}
        </p>
      )}

      <div className="label-meta">
        <ProvenanceField value={effectiveProvenance(draft)} onChange={(provenance) => set({ provenance })} complete={basicsFilled(draft)} />
        <span className="hint">Empty rows stay unknown, not zero.</span>
      </div>
    </div>
  );
}
