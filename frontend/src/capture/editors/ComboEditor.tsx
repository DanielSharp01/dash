import { useState } from "react";
import { saveFood } from "../../core/foods";
import { suggestIcon } from "../../core/icons";
import { portionContents } from "../../core/nutrition";
import { todayKey } from "../../core/time";
import type { Combo, Recipe } from "../../core/types";
import { NutritionPreview } from "../flows/EatFlow";
import { IconField } from "../ui/Pickers";
import { PortionList } from "./PortionList";

/** A combo becomes a recipe still being made, so its cooked weight or portions can be filled in. */
export function comboToRecipe(c: Combo): Recipe {
  return {
    id: crypto.randomUUID(),
    kind: "recipe",
    name: c.name,
    icon: c.icon,
    batches: [{ id: crypto.randomUUID(), madeOn: todayKey(), ingredients: c.parts }],
  };
}

export function ComboEditor({ combo, onSaved, onToRecipe }: { combo: Combo; onSaved: (c: Combo) => void; onToRecipe?: (c: Combo) => void }) {
  const [name, setName] = useState(combo.name);
  const [icon, setIcon] = useState(combo.icon);
  const [parts, setParts] = useState(combo.parts);
  const total = parts.reduce(
    (sum, p) => {
      const c = portionContents(p, todayKey());
      for (const k of ["kcal", "protein", "carbs", "fat"] as const) {
        const v = c?.[k];
        sum[k] = { value: sum[k].value + (v?.value ?? 0), complete: sum[k].complete && !!v?.complete };
      }
      return sum;
    },
    { kcal: { value: 0, complete: true }, protein: { value: 0, complete: true }, carbs: { value: 0, complete: true }, fat: { value: 0, complete: true } },
  );
  const draft = { ...combo, name: name.trim(), icon, parts };

  return (
    <div className="item-editor">
      <div className="name-row">
        <IconField value={icon} fallback={suggestIcon(name, ["drink", "food"]) ?? "🍱"} groups={["drink", "food"]} onChange={setIcon} />
        <input className="big-text" placeholder="e.g. My coffee" autoFocus={!combo.name} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <p className="hint">Things you put together and have at once. Logging it uses these amounts; you can change any of them that day.</p>

      <div className="field">
        <span className="field-label">What's in it</span>
        <PortionList portions={parts} kinds={["item", "recipe"]} addLabel="Add an item" onChange={setParts} />
      </div>

      {parts.length > 0 && <NutritionPreview contents={total} />}

      {onToRecipe && parts.length > 0 && (
        <button className="link-btn" onClick={() => onToRecipe(draft)}>
          Turn into a recipe
        </button>
      )}

      <div className="flow-footer">
        <button
          className="btn btn-primary btn-block"
          disabled={!name.trim() || parts.length === 0}
          onClick={() => {
            saveFood(draft);
            onSaved(draft);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
