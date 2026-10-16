import { useState } from "react";
import { defaultAmount, displayName, type Food, formatAmount, type Portion, unitsFor } from "@dash/core";
import { useFoodLookup } from "../../queries/foods.queries";
import { useProfile } from "../../queries/me.queries";
import { AddFoodSheet } from "../ui/AddFoodSheet";
import { AmountInput } from "../ui/AmountInput";

/** The items of a combo or a recipe, each with an amount that opens for editing. */
export function PortionList({ portions, kinds, addLabel, onChange }: { portions: Portion[]; kinds: Food["kind"][]; addLabel: string; onChange: (p: Portion[]) => void }) {
  const foods = useFoodLookup();
  const { units } = useProfile();
  const [open, setOpen] = useState<number>();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <ul className="list">
        {portions.map((p, i) => {
          const food = foods(p.foodId);
          const isOpen = open === i;
          return (
            <li key={`${p.foodId}-${i}`} className={`combo-line ${isOpen ? "open" : ""} ${food?.deleted ? "deleted" : ""}`}>
              <button className="row" onClick={() => setOpen(isOpen ? undefined : i)} aria-expanded={isOpen}>
                <span className="row-icon">{food?.icon ?? "?"}</span>
                <span className="row-main">
                  <span className="row-title">
                    {food ? displayName(food) : "Removed item"} {food?.deleted && <span className="badge badge-warn">Deleted</span>}{" "}
                    {food?.kind === "item" && food.unsure && <span className="badge badge-warn">Unsure</span>}
                  </span>
                  <span className="row-sub">{formatAmount(p.amount)}</span>
                </span>
                <span className="row-chevron">{isOpen ? "⌃" : "⌄"}</span>
              </button>
              {isOpen && (
                <div className="combo-line-edit">
                  <AmountInput
                    amount={p.amount}
                    units={food?.kind === "item" ? (food.unsure ? [...new Set([...unitsFor(food, units), ...unitsFor(undefined, units)])] : unitsFor(food, units)) : ["portion", "g"]}
                    allowOther={food?.kind === "item" && food.unsure}
                    onChange={(amount) => onChange(portions.map((x, j) => (j === i ? { ...x, amount } : x)))}
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
          onClose={() => setAdding(false)}
          onPick={(f) => {
            setAdding(false);
            onChange([...portions, { foodId: f.id, amount: f.kind === "item" ? defaultAmount(f, units) : { value: 1, unit: "portion" } }]);
            setOpen(portions.length);
          }}
        />
      )}
    </>
  );
}
