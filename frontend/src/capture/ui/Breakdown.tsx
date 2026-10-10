import { batchShare, type Contents, displayName, type FoodLookup, formatAmount, portionContents, round, scaleContents, type Amount, type Recipe } from "@dash/core";
import { MiniMacros } from "./MiniMacros";

export interface BreakdownRow {
  key: string;
  icon: string;
  name: string;
  amount: string;
  contents: Contents | undefined;
  parts?: BreakdownRow[];
}

export const kcalText = (c: Contents | undefined) => {
  const k = c?.kcal;
  if (!k || (!k.complete && k.value === 0)) return "? kcal";
  return `${k.complete ? "" : "≥"}${Math.round(k.value)} kcal`;
};

const tidy = (n: number) => (n >= 10 ? Math.round(n) : round(n));

/**
 * A recipe's ingredients cut down to the amount logged. While the batch has no yield there's
 * nothing to cut by, so it lists the whole batch and says so.
 */
export function ingredientRows(recipe: Recipe, batchId: string | undefined, amount: Amount, foods: FoodLookup): { rows: BreakdownRow[]; whole: boolean } {
  const batch = recipe.batches.find((b) => b.id === batchId);
  if (!batch) return { rows: [], whole: false };
  const share = batchShare(batch, amount);
  const by = share ?? 1;
  const rows = batch.ingredients.map((p, i) => {
    const food = foods(p.foodId);
    const contents = portionContents(p, batch.madeOn, foods);
    return {
      key: `${p.foodId}-${i}`,
      icon: food?.icon ?? "✎",
      name: food ? displayName(food) : "Something",
      amount: formatAmount(p.amount.value === undefined ? p.amount : { ...p.amount, value: tidy(p.amount.value * by) }),
      contents: contents && scaleContents(contents, by),
    };
  });
  return { rows, whole: share === undefined };
}

export function Breakdown({ title, rows, className = "" }: { title: string; rows: BreakdownRow[]; className?: string }) {
  if (!rows.length) return null;
  return (
    <section className={`breakdown ${className}`}>
      <h3 className="breakdown-title">{title}</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <BreakdownLine row={r} />
            {r.parts && r.parts.length > 0 && (
              <ul className="breakdown-parts">
                {r.parts.map((p) => (
                  <li key={p.key}>
                    <BreakdownLine row={p} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BreakdownLine({ row }: { row: BreakdownRow }) {
  return (
    <div className="breakdown-line">
      <span className="breakdown-icon" aria-hidden>
        {row.icon}
      </span>
      <span className="breakdown-name">
        {row.name}
        <small>{row.amount}</small>
        {row.contents && <MiniMacros contents={row.contents} className="breakdown-macros" />}
      </span>
      <span className="breakdown-kcal">{kcalText(row.contents)}</span>
    </div>
  );
}
