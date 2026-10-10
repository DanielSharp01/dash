import { useCallback, useState } from "react";
import { batchLabel, isFinished, recipeById, saveFood, useFoods } from "../../core/foods";
import { suggestIcon } from "../../core/icons";
import type { Recipe } from "../../core/types";
import { BatchEditor, startBatch } from "../editors/RecipeEditors";
import { FlowShell } from "../ui/FlowShell";
import { FoodSearch } from "../ui/FoodSearch";
import { useSteps } from "../ui/useSteps";

type Step = "name" | "batch" | "done";

/**
 * Records a recipe as it's made, without logging anything eaten. The batch is saved as it
 * goes, so closing mid-cook keeps it as a draft to come back to.
 */
export function CookFlow({ recipeId, onDone }: { recipeId?: string; onDone: (logPortionOf?: Recipe) => void }) {
  useFoods();
  const exit = useCallback(() => onDone(), [onDone]);
  const { step, depth, go, back, close } = useSteps<Step>(recipeId ? "batch" : "name", exit);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(recipeId);
  const recipe = recipeById(current);
  const draft = recipe && [...recipe.batches].reverse().find((b) => !isFinished(b));

  const cook = (r: Recipe) => {
    if (!r.batches.some((b) => !isFinished(b))) saveFood({ ...r, batches: [...r.batches, startBatch(r)] });
    setCurrent(r.id);
    go("batch");
  };

  if (step === "done" && recipe)
    return (
      <FlowShell title={recipe.name} subtitle="Done cooking" canGoBack={false} onBack={back} onClose={close}>
        <p className="hint">It's in your recipes now. Log portions from I ate whenever you eat some.</p>
        <div className="save-choices">
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              onDone(recipe);
            }}
          >
            Log a portion now
          </button>
          <button className="btn btn-block" onClick={close}>
            Done
          </button>
        </div>
      </FlowShell>
    );

  if (step === "batch" && recipe && draft)
    return (
      <FlowShell title={recipe.name} subtitle={`Cooking · ${batchLabel(draft)}`} canGoBack={depth > 1} onBack={back} onClose={close}>
        <BatchEditor recipeId={recipe.id} batchId={draft.id} onFinished={() => go("done")} />
      </FlowShell>
    );

  return (
    <FlowShell title="I cooked" canGoBack={false} onBack={back} onClose={close}>
      <p className="hint">Name the dish, then add ingredients as they go in. You log what you eat from it later, in portions.</p>
      <FoodSearch
        query={query}
        onQuery={setQuery}
        kinds={["recipe"]}
        recentIds={[]}
        unfinished
        placeholder="What are you cooking?"
        onPick={(f) => f.kind === "recipe" && cook(f)}
        onNew={(name) => cook({ id: crypto.randomUUID(), kind: "recipe", name: name.trim(), icon: suggestIcon(name, ["food"]), batches: [] })}
        extra={
          !query.trim() && (
            <li>
              <button className="row row-create" onClick={() => document.querySelector<HTMLInputElement>(".search-bar input")?.focus()}>
                <span className="row-icon">＋</span>
                <span className="row-main">
                  <span className="row-title">New dish</span>
                  <span className="row-sub">Type its name above, e.g. chicken stew</span>
                </span>
              </button>
            </li>
          )
        }
      />
    </FlowShell>
  );
}
