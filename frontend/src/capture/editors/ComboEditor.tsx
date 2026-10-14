import { useState } from "react";
import { asItem, autoFoodIcon, displayName, type Batch, type Combo, type ComboInput, type FoodLookup, portionContents, type RecipeInput, withBase } from "@dash/core";
import { publishFood, saveFood, useFoodLookup } from "../../queries/foods.queries";
import { ownCopy } from "../foods";
import { NutritionPreview } from "../flows/EatFlow";
import { todayKey } from "../time";
import { IconField } from "../ui/Pickers";
import { PublishButton } from "../ui/PublishButton";
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
  onBackToShared,
}: {
  combo: Combo;
  onSaved: (c: Combo, saved: Promise<{ undoToken?: string }>) => void;
  onToRecipe?: (c: ComboInput) => void;
  /** Only on a copy of a public combo: dropping the copy shows the shared one again. */
  onBackToShared?: () => void;
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

  // Everyone must be able to see every part, so private ones have to be published first.
  const privateParts = parts.map((p) => foods(p.foodId)).filter((f) => f && !f.public).map((f) => displayName(f!));
  const save = (publish: boolean) => {
    const input = ownCopy(draft, combo);
    const saved = saveFood(input);
    onSaved({ ...combo, ...input }, publish ? saved.then(async (r) => (await publishFood(combo.id), r)) : saved);
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

      <div className="editor-links">
        {onToRecipe && parts.length > 0 && allItems(parts, foods) && (
          <button className="btn btn-block" onClick={() => onToRecipe(draft)}>
            Turn into a recipe
          </button>
        )}
        {onBackToShared && (
          <button className="btn btn-block" onClick={onBackToShared}>
            Back to the shared combo
          </button>
        )}
      </div>

      <div className="flow-footer">
        {combo.public || !combo.catalogued ? (
          <button className="btn btn-primary btn-block" disabled={!name.trim() || parts.length === 0} onClick={() => save(false)}>
            Save
          </button>
        ) : (
          <div className="save-choices">
            <PublishButton
              blockers={privateParts.length ? [`Publish ${privateParts.join(", ")} first`] : []}
              label="Save and publish"
              disabled={!name.trim() || parts.length === 0 || privateParts.length > 0}
              onClick={() => save(true)}
            />
            <button className={`btn btn-block ${privateParts.length ? "btn-primary" : ""}`} disabled={!name.trim() || parts.length === 0} onClick={() => save(false)}>
              Save privately
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
