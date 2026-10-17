import { useState } from "react";
import { currentBatch, defaultAmount, displayName, type Food, formatAmount, type Portion, unitsFor } from "@dash/core";
import { useFoodLookup } from "../../queries/foods.queries";
import { useProfile } from "../../queries/me.queries";
import { batchLabel, recipeUnits } from "../foods";
import { AddFoodSheet } from "../ui/AddFoodSheet";
import { AmountInput } from "../ui/AmountInput";
import { BatchChoice } from "../ui/BatchChoice";

/**
 * The items of a combo or a recipe, each with an amount that opens for editing. Inside a recipe,
 * `within`, a recipe added comes from its current batch, sized the way that batch was.
 */
export function PortionList({
  portions,
  kinds,
  addLabel,
  within,
  onChange,
}: {
  portions: Portion[];
  kinds: Food["kind"][];
  addLabel: string;
  within?: string;
  onChange: (p: Portion[]) => void;
}) {
  const foods = useFoodLookup();
  const { units } = useProfile();
  const [open, setOpen] = useState<number>();
  const [adding, setAdding] = useState(false);
  const change = (i: number, patch: Partial<Portion>) => onChange(portions.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const portionOf = (f: Food): Portion => {
    if (f.kind === "item") return { foodId: f.id, amount: defaultAmount(f, units) };
    if (!within || f.kind !== "recipe") return { foodId: f.id, amount: { value: 1, unit: "portion" } };
    const batchId = currentBatch(f)?.id;
    // How much of a coating or sauce went in is weighed each time, so it starts empty.
    const unit = recipeUnits(f, batchId, units, foods)[0];
    return { foodId: f.id, ...(batchId ? { batchId } : {}), amount: unit === "portion" ? { value: 1, unit } : { unit } };
  };

  return (
    <>
      <ul className="list">
        {portions.map((p, i) => {
          const food = foods(p.foodId);
          const isOpen = open === i;
          const batch = food?.kind === "recipe" ? food.batches.find((b) => b.id === p.batchId) : undefined;
          return (
            <li key={`${p.foodId}-${i}`} className={`combo-line ${isOpen ? "open" : ""} ${food?.deleted ? "deleted" : ""}`}>
              <button className="row" onClick={() => setOpen(isOpen ? undefined : i)} aria-expanded={isOpen}>
                <span className="row-icon">{food?.icon ?? "?"}</span>
                <span className="row-main">
                  <span className="row-title">
                    {food ? displayName(food) : "Removed item"} {food?.deleted && <span className="badge badge-warn">Deleted</span>}{" "}
                    {food?.kind === "item" && food.unsure && <span className="badge badge-warn">Unsure</span>}
                  </span>
                  <span className="row-sub">
                    {formatAmount(p.amount)}
                    {batch && ` · ${batch.shared ? "shared" : batchLabel(batch)} batch`}
                  </span>
                </span>
                <span className="row-chevron">{isOpen ? "⌃" : "⌄"}</span>
              </button>
              {isOpen && (
                <div className="combo-line-edit">
                  {within && food?.kind === "recipe" && <BatchChoice recipe={food} batchId={p.batchId} onChange={(batchId) => change(i, { batchId })} />}
                  <AmountInput
                    amount={p.amount}
                    units={
                      food?.kind === "item"
                        ? food.unsure
                          ? [...new Set([...unitsFor(food, units), ...unitsFor(undefined, units)])]
                          : unitsFor(food, units)
                        : within && food?.kind === "recipe"
                          ? recipeUnits(food, p.batchId, units, foods)
                          : ["portion", "g"]
                    }
                    allowOther={food?.kind === "item" && food.unsure}
                    onChange={(amount) => change(i, { amount })}
                  />
                  <button
                    className="link-btn danger"
                    onClick={() => {
                      setOpen(undefined);
                      onChange(portions.filter((_, j) => j !== i));
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button className="row row-create" onClick={() => setAdding(true)}>
        <span className="row-icon">＋</span>
        <span className="row-main">
          <span className="row-title">{addLabel}</span>
        </span>
      </button>
      {adding && (
        <AddFoodSheet
          title={addLabel}
          kinds={kinds}
          excludeId={within}
          onClose={() => setAdding(false)}
          onPick={(f) => {
            setAdding(false);
            onChange([...portions, portionOf(f)]);
            setOpen(portions.length);
          }}
        />
      )}
    </>
  );
}
