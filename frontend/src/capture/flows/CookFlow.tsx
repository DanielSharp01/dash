import { useCallback, useState } from "react";
import { asRecipe, type Recipe } from "@dash/core";
import { useFoodLookup } from "../../queries/foods.queries";
import { BatchEditor, createRecipe, startBatch } from "../editors/RecipeEditors";
import { batchLabel, unfinishedBatch } from "../foods";
import { FlowShell } from "../ui/FlowShell";
import { FoodSearch } from "../ui/FoodSearch";
import { useSteps } from "../ui/useSteps";

type Step = "name" | "batch" | "done";

/**
 * Records a recipe as it's made, without logging anything eaten. A new batch is saved from its
 * first change on, so closing mid-cook keeps it to come back to and closing untouched leaves nothing.
 */
export function CookFlow({ recipeId, onDone }: { recipeId?: string; onDone: (logPortionOf?: Recipe) => void }) {
  const foods = useFoodLookup();
  const exit = useCallback(() => onDone(), [onDone]);
  const { step, depth, go, back, close } = useSteps<Step>(recipeId ? "batch" : "name", exit);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(recipeId);
  const recipe = asRecipe(foods(current));
  const [draft, setDraft] = useState(() => (recipe && !unfinishedBatch(recipe) ? startBatch(recipe, foods) : undefined));
  const batch = recipe && (unfinishedBatch(recipe) ?? draft);

  const cook = (r: Recipe) => {
    if (!unfinishedBatch(r)) setDraft(startBatch(r, foods));
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

  if (step === "batch" && recipe && batch)
    return (
      <FlowShell title={recipe.name} subtitle={`Cooking · ${batchLabel(batch)}`} canGoBack={depth > 1} onBack={back} onClose={close}>
        <BatchEditor recipeId={recipe.id} batchId={batch.id} draft={draft} onFinished={() => go("done")} />
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
        onNew={(name) => {
          setCurrent(createRecipe(name.trim()).id);
          setDraft(startBatch({ batches: [] }));
          go("batch");
        }}
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
