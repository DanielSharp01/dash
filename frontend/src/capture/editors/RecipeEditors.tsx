import { useState } from "react";
import { batchLabel, isFinished, itemById, recipeById, saveFood, setBatchGone, useFoods } from "../../core/foods";
import { suggestIcon } from "../../core/icons";
import { round } from "../../core/label";
import { batchPerUnit, batchTotal, withBase } from "../../core/nutrition";
import { useProfile } from "../../core/profile";
import { todayKey } from "../../core/time";
import type { Batch, Combo, Recipe } from "../../core/types";
import { NutritionPreview } from "../flows/EatFlow";
import { NumberInput } from "../ui/NumberInput";
import { IconField } from "../ui/Pickers";
import { PortionList } from "./PortionList";

function storeBatch(recipeId: string, batch: Batch) {
  const r = recipeById(recipeId);
  const recorded = { ...batch, ingredients: batch.ingredients.map((p) => withBase(p, itemById(p.foodId))) };
  if (r) saveFood({ ...r, batches: r.batches.map((b) => (b.id === batch.id ? recorded : b)) });
}

/** The next cooking starts from the last one's ingredients, to adjust for this time. */
export function startBatch(r: Recipe): Batch {
  const last = r.batches[r.batches.length - 1];
  return { id: crypto.randomUUID(), madeOn: todayKey(), ingredients: last ? last.ingredients.map(({ foodId, amount }) => ({ foodId, amount })) : [] };
}

export const recipeToCombo = (r: Recipe, b: Batch): Combo => ({ id: crypto.randomUUID(), kind: "combo", name: r.name, icon: r.icon, parts: b.ingredients });

/**
 * Ingredients are saved as they go in, since cooking takes a while. Weighing the finished dish
 * sizes it; the pot's weight comes off so it can stay on the scale.
 */
export function BatchEditor({ recipeId, batchId, onFinished }: { recipeId: string; batchId: string; onFinished: (b: Batch) => void }) {
  useFoods();
  const { pots } = useProfile();
  const recipe = recipeById(recipeId);
  const batch = recipe?.batches.find((b) => b.id === batchId);
  const [mode, setMode] = useState<"weighed" | "portions">(() => (batch?.yield && "portions" in batch.yield ? "portions" : "weighed"));
  const [scale, setScale] = useState<number | undefined>(() => (batch?.yield && "grams" in batch.yield ? batch.yield.grams : undefined));
  const [potId, setPotId] = useState<string>();
  const [portions, setPortions] = useState<number | undefined>(() => (batch?.yield && "portions" in batch.yield ? batch.yield.portions : undefined));
  if (!recipe || !batch) return <p className="empty">This batch no longer exists.</p>;

  const pot = pots.find((p) => p.id === potId);
  const grams = scale !== undefined ? scale - (pot?.grams ?? 0) : undefined;
  const yieldNow = mode === "weighed" ? (grams && grams > 0 ? { grams } : undefined) : portions && portions > 0 ? { portions } : undefined;
  const total = batchTotal(batch);
  const sized = yieldNow && batchPerUnit({ ...batch, yield: yieldNow });

  return (
    <div className="item-editor">
      <label className="field compact">
        <span className="field-label">Made on</span>
        <input className="text-input" type="date" max={todayKey()} value={batch.madeOn} onChange={(e) => e.target.value && storeBatch(recipeId, { ...batch, madeOn: e.target.value })} />
      </label>

      <div className="field">
        <span className="field-label">Ingredients, as they go in</span>
        <p className="hint">Raw weights from the raw labels. Water counts toward the weight and adds nothing else.</p>
        <PortionList portions={batch.ingredients} kinds={["item"]} addLabel="Add an ingredient" onChange={(ingredients) => storeBatch(recipeId, { ...batch, ingredients })} />
      </div>

      {batch.ingredients.length > 0 && (
        <div className="field">
          <span className="field-label">The whole pot</span>
          <NutritionPreview contents={total} />
        </div>
      )}

      <div className="field">
        <span className="field-label">When it's done</span>
        <div className="segmented small">
          <button aria-selected={mode === "weighed"} onClick={() => setMode("weighed")}>
            I weighed it
          </button>
          <button aria-selected={mode === "portions"} onClick={() => setMode("portions")}>
            In portions
          </button>
        </div>
        {mode === "weighed" ? (
          <>
            <label className="kcal-field">
              <NumberInput integer placeholder="?" value={scale} onChange={setScale} />
              <span>g on the scale</span>
            </label>
            {pots.length > 0 && (
              <div className="chip-row" role="radiogroup" aria-label="Pot">
                <button className="chip" role="radio" aria-checked={!pot} onClick={() => setPotId(undefined)}>
                  No pot
                </button>
                {pots.map((p) => (
                  <button key={p.id} className="chip" role="radio" aria-checked={pot?.id === p.id} onClick={() => setPotId(p.id)}>
                    − {p.name} <small>{p.grams} g</small>
                  </button>
                ))}
              </div>
            )}
            <p className="hint">
              {pot && grams !== undefined ? `${grams.toLocaleString()} g of food. ` : ""}
              {pots.length === 0 && "Add your pots' weights in Settings to weigh it in the pot. "}
              Weighing the result takes care of water boiled off or soaked up.
            </p>
          </>
        ) : (
          <label className="kcal-field">
            <NumberInput placeholder="?" value={portions} onChange={setPortions} />
            <span>portions</span>
          </label>
        )}
        {sized?.per.kcal && (
          <p className="hint">
            That's {sized.per.kcal.complete ? "" : "at least "}
            {round(sized.per.kcal.value * (sized.unit === "g" ? 100 : 1), 0)} kcal per {sized.unit === "g" ? "100 g" : "portion"}.
          </p>
        )}
      </div>

      {isFinished(batch) && (
        <label className="check-line">
          <input type="checkbox" checked={!!batch.gone} onChange={(e) => setBatchGone(recipeId, batch.id, e.target.checked)} />
          All eaten, stop offering it when logging
        </label>
      )}

      <div className="flow-footer">
        <button
          className="btn btn-primary btn-block"
          disabled={!yieldNow || batch.ingredients.length === 0}
          onClick={() => {
            const finished = { ...recipeById(recipeId)!.batches.find((b) => b.id === batch.id)!, yield: yieldNow };
            storeBatch(recipeId, finished);
            onFinished(finished);
          }}
        >
          {isFinished(batch) ? "Save" : "Done cooking"}
        </button>
      </div>
    </div>
  );
}

export function RecipeEditor({ recipe, onOpenBatch, onCookAgain, onToCombo }: { recipe: Recipe; onOpenBatch: (b: Batch) => void; onCookAgain: () => void; onToCombo: (c: Combo) => void }) {
  useFoods();
  const current = recipeById(recipe.id) ?? recipe;
  const [name, setName] = useState(current.name);
  const [icon, setIcon] = useState(current.icon);
  const rename = (patch: Partial<Recipe>) => saveFood({ ...current, ...patch });
  const latest = [...current.batches].reverse().find(isFinished);

  return (
    <div className="item-editor">
      <div className="name-row">
        <IconField
          value={icon}
          fallback={suggestIcon(name, ["food"]) ?? "🍲"}
          groups={["food"]}
          onChange={(i) => {
            setIcon(i);
            rename({ icon: i });
          }}
        />
        <input className="big-text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && rename({ name: name.trim() })} />
      </div>

      <div className="field">
        <span className="field-label">Batches</span>
        <p className="hint">Each cooking keeps its own ingredients and values. Logging uses the latest unless you pick another.</p>
        <ul className="list">
          {[...current.batches].reverse().map((b) => {
            const sized = batchPerUnit(b);
            return (
              <li key={b.id}>
                <button className="row" onClick={() => onOpenBatch(b)}>
                  <span className="row-icon">{isFinished(b) ? "🍲" : "🔥"}</span>
                  <span className="row-main">
                    <span className="row-title">
                      {batchLabel(b)} {!isFinished(b) && <span className="badge badge-warn">Cooking</span>}
                      {isFinished(b) && !b.gone && <span className="badge badge-info">Some left</span>}
                    </span>
                    <span className="row-sub">
                      {b.ingredients.length} ingredients
                      {sized?.per.kcal && ` · ${round(sized.per.kcal.value * (sized.unit === "g" ? 100 : 1), 0)} kcal / ${sized.unit === "g" ? "100 g" : "portion"}`}
                    </span>
                  </span>
                  <span className="row-chevron">›</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button className="row row-create" onClick={onCookAgain}>
          <span className="row-icon">🔥</span>
          <span className="row-main">
            <span className="row-title">Cook it again</span>
            <span className="row-sub">Starts from the last batch's ingredients</span>
          </span>
        </button>
      </div>

      {latest && (
        <button className="link-btn" onClick={() => onToCombo(recipeToCombo(current, latest))}>
          Turn into a combo
        </button>
      )}
    </div>
  );
}
