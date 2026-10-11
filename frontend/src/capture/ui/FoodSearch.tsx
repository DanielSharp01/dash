import type { ReactNode } from "react";
import { basisLabel, batchPerUnit, displayName, type Food, type FoodLookup, labelAt, latestBatch, loggable, round } from "@dash/core";
import { useFoodLookup } from "../../queries/foods.queries";
import { batchLabel, useListedFoods } from "../foods";
import { canScan } from "./Scanner";

export function foodSummary(f: Food, foods: FoodLookup): string {
  if (f.kind === "combo") return f.parts.map((p) => foods(p.foodId)?.name ?? "?").join(" + ") || "empty combo";
  if (f.kind === "recipe") {
    const b = latestBatch(f);
    const sized = b && batchPerUnit(b, foods);
    const kcal = sized?.per.kcal;
    if (!b) return "still cooking";
    return `${batchLabel(b)} batch${kcal ? ` · ${round(kcal.value * (sized.unit === "g" ? 100 : 1), 0)} kcal / ${sized.unit === "g" ? "100 g" : "portion"}` : ""}`;
  }
  const l = labelAt(f);
  if (f.unsure) return "unsure item";
  if (!l?.values.kcal && l?.values.kcal !== 0) return "no label yet";
  return `${round(l.values.kcal, 0)} kcal ${basisLabel(l, f.unit)}`;
}

/** With `open` set, tapping toggles the row and `open` holds what shows under it. */
export function FoodRow({ food, onPick, sub, open }: { food: Food; onPick: (f: Food) => void; sub?: string; open?: ReactNode }) {
  const foods = useFoodLookup();
  return (
    <li>
      <button className="row" onClick={() => onPick(food)} aria-expanded={open === undefined ? undefined : !!open}>
        <span className="row-icon">{food.icon}</span>
        <span className="row-main">
          <span className="row-title">
            {food.name} {food.kind === "item" && food.variant && <span className="badge badge-variant">{food.variant}</span>}
            {food.kind === "combo" && <span className="badge badge-muted">combo</span>}
            {food.kind === "recipe" && <span className="badge badge-muted">recipe</span>}
            {food.kind === "item" && food.unsure && <span className="badge badge-warn">Unsure</span>}
          </span>
          <span className="row-sub">{sub ?? foodSummary(food, foods)}</span>
        </span>
        <span className="row-chevron">›</span>
      </button>
      {open}
    </li>
  );
}

interface Props {
  query: string;
  onQuery: (q: string) => void;
  kinds: Food["kind"][];
  recentIds: string[];
  onPick: (f: Food) => void;
  /** Shown as a "+ New" row whenever something is typed, even next to matches. */
  onNew?: (name: string) => void;
  onScan?: () => void;
  barcode?: string;
  onClearBarcode?: () => void;
  /** A name the product database found for the scanned barcode. */
  foundName?: string;
  extra?: ReactNode;
  placeholder?: string;
  /** Also lists recipes that have never finished cooking, e.g. when starting to cook one. */
  unfinished?: boolean;
}

export function FoodSearch({ query, onQuery, kinds, recentIds, onPick, onNew, onScan, barcode, onClearBarcode, foundName, extra, placeholder, unfinished = false }: Props) {
  const lookup = useFoodLookup();
  const listed = useListedFoods();
  const offered = (f: Food) => kinds.includes(f.kind) && (unfinished || loggable(f));
  const foods = listed.filter(offered);
  const q = query.trim().toLowerCase();
  const matches = q ? foods.filter((f) => displayName(f).toLowerCase().includes(q)) : [];
  const recent = recentIds.map(lookup).filter((f): f is Food => !!f && foods.includes(f));
  const rest = foods.filter((f) => !recent.includes(f)).sort((a, b) => a.name.localeCompare(b.name));
  const newName = query.trim() || foundName;

  return (
    <>
      <div className="search-bar">
        <input type="search" placeholder={barcode ? "Name it, or pick a match" : (placeholder ?? "Search")} value={query} autoFocus={!!barcode || !!query} onChange={(e) => onQuery(e.target.value)} />
        {onScan && canScan() && (
          <button className="scan-btn" onClick={onScan} aria-label="Scan barcode">
            <BarcodeIcon />
          </button>
        )}
      </div>

      {barcode && (
        <div className="notice">
          <span>
            Barcode <code>{barcode}</code> isn't in your items. {foundName ? "The product database knows it." : "Name it, or pick what it is."}
          </span>
          {onClearBarcode && (
            <button className="icon-btn small" onClick={onClearBarcode} aria-label="Discard barcode">
              ✕
            </button>
          )}
        </div>
      )}

      <ul className="list">
        {onNew && (newName || barcode) && (
          <li>
            <button className="row row-create" onClick={() => onNew(query.trim() || foundName || "")}>
              <span className="row-icon">＋</span>
              <span className="row-main">
                <span className="row-title">{newName ? `New “${newName}”` : "New with this barcode"}</span>
                <span className="row-sub">{foundName ? "Label from the product database" : "Fill in the label now or later"}</span>
              </span>
            </button>
          </li>
        )}
        {extra}
        {q ? (
          matches.map((f) => <FoodRow key={f.id} food={f} onPick={onPick} />)
        ) : (
          <>
            {recent.length > 0 && <li className="list-heading">Recent</li>}
            {recent.map((f) => (
              <FoodRow key={f.id} food={f} onPick={onPick} />
            ))}
            {rest.length > 0 && <li className="list-heading">{recent.length ? "Everything else" : kinds.length === 1 && kinds[0] === "recipe" ? "Cooked before" : "Your items"}</li>}
            {rest.map((f) => (
              <FoodRow key={f.id} food={f} onPick={onPick} />
            ))}
          </>
        )}
        {q && matches.length === 0 && <li className="hint">Nothing called “{query.trim()}” yet.</li>}
      </ul>
    </>
  );
}

export function BarcodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8" />
    </svg>
  );
}
