import { useState } from "react";
import { asItem, autoFoodIcon, type Batch, type Combo, type ComboInput, type FoodLookup, portionContents, type RecipeInput, withBase } from "@dash/core";
import { saveFood, useFoodLookup } from "../../queries/foods.queries";
import { ownCopy } from "../foods";
import { NutritionPreview } from "../flows/EatFlow";
import { todayKey } from "../time";
import { IconField } from "../ui/Pickers";
import { PortionList } from "./PortionList";

/** A combo becomes a recipe still being made, so its cooked weight or portions can be filled in. */
export function comboToRecipe(c: ComboInput, foods: FoodLookup): { recipe: RecipeInput; batch: Batch } {
  const { parts, kind: _, originId: __, ...common } = c;
  return {
    recipe: { ...common, id: crypto.randomUUID(), kind: "recipe", catalogued: true },
    batch: { id: crypto.randomUUID(), madeOn: todayKey(), ingredients: parts.map((p) => withBase(p, asItem(foods(p.foodId)))), gone: false },
  };
}

/** Recipe ingredients are items only, so a combo with a recipe in it can't become one. */
const allItems = (parts: ComboInput["parts"], foods: FoodLookup) => parts.every((p) => foods(p.foodId)?.kind === "item");

export function ComboEditor({
  combo,
  onSaved,
  onToRecipe,
}: {
  combo: Combo;
  onSaved: (c: Combo, saved: Promise<{ undoToken?: string }>) => void;
  onToRecipe?: (c: ComboInput) => void;
}) {
  const foods = useFoodLookup();
  const [name, setName] = useState(combo.name);
  const [icon, setIcon] = useState(combo.iconAuto ? undefined : combo.icon);
  const [parts, setParts] = useState(combo.parts);
  const total = parts.reduce(
    (sum, p) => {
      const c = portionContents(p, todayKey(), foods);
      for (const k of ["kcal", "protein", "carbs", "fat"] as const) {
        const v = c?.[k];
        sum[k] = { value: sum[k].value + (v?.value ?? 0), complete: sum[k].complete && !!v?.complete };
      }
      return sum;
    },
    { kcal: { value: 0, complete: true }, protein: { value: 0, complete: true }, carbs: { value: 0, complete: true }, fat: { value: 0, complete: true } },
  );
  const draft: ComboInput = {
    id: combo.id,
    kind: "combo",
    name: name.trim(),
    icon: icon ?? autoFoodIcon(name, "combo"),
    iconAuto: icon === undefined,
    catalogued: true,
    ...(combo.originId ? { originId: combo.originId } : {}),
    parts,
  };

  return (
    <div className="item-editor">
      <div className="name-row">
        <IconField value={icon} fallback={autoFoodIcon(name, "combo")} groups={["drink", "food"]} onChange={setIcon} />
        <input className="big-text" placeholder="e.g. My coffee" autoFocus={!combo.name} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <p className="hint">Things you put together and have at once. Logging it uses these amounts; you can change any of them that day.</p>
      {combo.public && <p className="hint">A built-in combo. Saving makes it your own copy.</p>}

      <div className="field">
        <span className="field-label">What's in it</span>
        <PortionList portions={parts} kinds={["item", "recipe"]} addLabel="Add an item" onChange={setParts} />
      </div>

      {parts.length > 0 && <NutritionPreview contents={total} />}

      {onToRecipe && parts.length > 0 && allItems(parts, foods) && (
        <div className="editor-links">
          <button className="btn btn-block" onClick={() => onToRecipe(draft)}>
            Turn into a recipe
          </button>
        </div>
      )}

      <div className="flow-footer">
        <button
          className="btn btn-primary btn-block"
          disabled={!name.trim() || parts.length === 0}
          onClick={() => {
            const input = ownCopy(draft, combo);
            onSaved({ ...combo, ...input }, saveFood(input));
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
